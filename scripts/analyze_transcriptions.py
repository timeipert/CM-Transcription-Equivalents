import monodikit
import json
from collections import defaultdict
import os
import glob
import re
import pandas as pd
from logic import pitch_to_midi, get_direction, get_suffix

CACHE_FILE = "transcription_cache.json"

def extract_pattern(notes):
    if len(notes) < 2:
        return ""
    
    pitches = []
    for note in notes:
        if isinstance(note, tuple):
            b, o = note
            pitches.append(pitch_to_midi(b, o))
        else:
            pass 
    
    directions = []
    for i in range(len(pitches) - 1):
        directions.append(get_direction(pitches[i], pitches[i+1]))
    
    return "".join(directions)


def analyze_single_source(corpus_path):
    print(f"Loading source from {corpus_path}...")
    corpus = monodikit.Corpus(corpus_path)
    print(f"Loaded {len(corpus.documents)} documents.")

    results = defaultdict(lambda: defaultdict(list))
    
    for doc_idx, doc in enumerate(corpus.documents):
        if doc_idx % 10 == 0:
            print(f"Processing doc {doc_idx}/{len(corpus.documents)}")

        source = "Unknown"
        if hasattr(doc, "meta") and doc.meta:
             if hasattr(doc.meta, "source_id") and doc.meta.source_id:
                 source = str(doc.meta.source_id)
             elif hasattr(doc.meta, "source") and doc.meta.source:
                 source = str(doc.meta.source)
             
             if source == "Unknown" and hasattr(doc.meta, "get"):
                 source = doc.meta.get("source_id", doc.meta.get("source", "Unknown"))

        # Extract Doc ID to check for filter
        doc_id = "unknown"
        if hasattr(doc, "meta") and hasattr(doc.meta, "document_id"):
             doc_id = str(doc.meta.document_id)
        elif hasattr(doc, "meta") and hasattr(doc.meta, "get"):
             doc_id = doc.meta.get("document_id", "unknown")
        
        # Filter: Exclude documents ending in 'TR' (Transcribed) or 'GR'
        if doc_id.endswith("TR") or doc_id.endswith("GS"):
             continue


        # Traversal Context
        # User requested to use foliostart and zeilenstart from meta
        initial_folio = ""
        initial_line_str = "0"
        
        if hasattr(doc, "meta") and doc.meta:
            if isinstance(doc.meta, dict):
                initial_folio = doc.meta.get("foliostart", "")
                initial_line_str = doc.meta.get("zeilenstart", "0")
            else:
                initial_folio = getattr(doc.meta, "foliostart", "")
                initial_line_str = getattr(doc.meta, "zeilenstart", "0")
        
        # Try to parse line start
        try:
            line_counter = int(initial_line_str)
        except ValueError:
            line_counter = 0

        current_context = {
            "folio": str(initial_folio),
            "line": str(initial_line_str),
            "syllable": ""
        }

        def traverse(node):
            nonlocal line_counter
            node_type = getattr(node, "kind", None)
            if isinstance(node, dict): node_type = node.get("kind")
            
            # Update Context
            # Div/Section labels MIGHT override or supplement, but keeping meta as base
            if hasattr(node, "label") or (isinstance(node, dict) and "label" in node):
                val = getattr(node, "label", node.get("label")) if isinstance(node, dict) else getattr(node, "label", "")
                if val: current_context["folio"] = str(val)
            
            # Line context if available (ZeileContainer)
            # Increment line counter on ZeileContainer
            if node_type == "ZeileContainer":
                 line_counter += 1
                 current_context["line"] = str(line_counter)
            
            # Check for Syllable
            if node_type == "Syllable":
                text = getattr(node, "text", "") if not isinstance(node, dict) else node.get("text", "")
                current_context["syllable"] = text
                
                # Syllables contain 'notes' which is a dict (e.g. {'spaced': [...]})
                notes_data = getattr(node, "notes", None) if not isinstance(node, dict) else node.get("notes")
                
                if not notes_data or not isinstance(notes_data, dict) or "spaced" not in notes_data:
                    return

                # Iterate through 'spaced' list (Phrases/Words separated by space)
                # Each item typically has 'nonSpaced' list (The Unit)
                for spaced_item in notes_data["spaced"]:
                     if "nonSpaced" not in spaced_item:
                         continue
                     
                     non_spaced_unit = spaced_item["nonSpaced"] # This is the list of neumes/groups
                     process_non_spaced(non_spaced_unit)
                return # Syllable processing is done, no further recursion needed for its children here

            elif node_type == "FolioChange":
                # Update folio context
                if hasattr(node, "folio"):
                    current_context["folio"] = node.folio
                elif hasattr(node, "text"):
                    current_context["folio"] = node.text
                # Reset line count on folio change? Usually yes.
                # current_context["line"] = "1" 

            elif node_type == "LineChange":
                # Update line context - user says "count for the line".
                # If it has an explicit number, use it. Otherwise increment.
                if hasattr(node, "n") and node.n:
                    current_context["line"] = str(node.n)
                elif hasattr(node, "line") and node.line:
                    current_context["line"] = str(node.line)
                else:
                    # Increment existing integer-like line or append
                    try:
                        val = int(current_context["line"])
                        current_context["line"] = str(val + 1)
                    except:
                        # If line was "7" or "7r", and now we just increment?
                        pass
            
            # elif node_type == "ZeileContainer": # This is handled above now
            #     # Fallback/Supplemental: increment line count if we rely on containers
            #     # Only do this if we haven't just processed a LineChange?
            #     # Let's rely on LineChange if present, else ZeileContainer?
            #     # The introspection showed 187 ZeileContainers vs 113 LineChanges.
            #     # ZeileContainer is likely the visual line wrapper.
            #     try:
            #         val = int(current_context["line"])
            #         current_context["line"] = str(val + 1)
            #     except:
            #         pass

            elif node_type == "nonSpaced":
                # Check if this node IS a nonSpaced group or has one
                # monodikit: Neume nodes are usually children of Syllable/Zeile.
                # nonSpaced might be a grouping container.
                # If we are strictly looking for "nonSpaced" elements as the unit:
                process_non_spaced(node)
                return # Don't recurse into nonSpaced children (we handled them)
                
            # Recurse
            children = getattr(node, "children", []) if not isinstance(node, dict) else node.get("children", node.get("elements", []))
            for child in children:
                traverse(child)

        # DEFINE HELPER
        def process_non_spaced(non_spaced_unit):
             # Helper to extract notes from a Neume, Group, or Note element
             def extract_notes_from_element(element):
                 extracted = []
                 
                 if isinstance(element, dict) and "grouped" in element:
                     for sub in element["grouped"]:
                         extracted.extend(extract_notes_from_element(sub))
                     return extracted

                 sub_notes = []
                 if isinstance(element, dict):
                     sub_notes = element.get("neume_components", element.get("children", element.get("notes", [])))
                     if not sub_notes and ("base" in element or "octave" in element):
                         return [element]
                 else:
                     if hasattr(element, "neume_components"): sub_notes = element.neume_components
                     elif hasattr(element, "notes"): sub_notes = element.notes
                     elif hasattr(element, "elements"): sub_notes = element.elements
                     else:
                         if hasattr(element, "base") or hasattr(element, "octave"):
                             return [element]

                 if sub_notes:
                     for n in sub_notes:
                         extracted.extend(extract_notes_from_element(n))
                 
                 return extracted

             # Ensure iterable
             if not isinstance(non_spaced_unit, list) and hasattr(non_spaced_unit, "children"):
                  # It's a node
                  non_spaced_unit = non_spaced_unit.children
             elif isinstance(non_spaced_unit, dict):
                  non_spaced_unit = non_spaced_unit.get("children", [])

             if not non_spaced_unit: return

             unit_notes = []
             for item in non_spaced_unit:
                 unit_notes.extend(extract_notes_from_element(item))
             
             real_notes = []
             # Debug: collect types
             # note_types_counter = Counter() (Need to import Counter or use dict)
             
             for n in unit_notes:
                b, o = None, None
                nt, liq = "Normal", False
                
                if hasattr(n, "base"): b = n.base
                elif isinstance(n, dict): b = n.get("base")
                
                if hasattr(n, "octave"): o = n.octave
                elif hasattr(n, "oct"): o = n.oct
                elif isinstance(n, dict): o = n.get("octave", n.get("oct"))
                
                # Extract Attributes
                if hasattr(n, "noteType"): nt = n.noteType
                elif isinstance(n, dict): nt = n.get("noteType", "Normal")
                
                if hasattr(n, "liquescent"): liq = n.liquescent
                elif isinstance(n, dict): liq = n.get("liquescent", False)

                if b and o:
                    real_notes.append({
                        "pitch": pitch_to_midi(b, int(o)),
                        "base": b,
                        "octave": int(o),
                        "type": nt,
                        "liquescent": liq
                    })
             
             if real_notes:
                 group_segments = []
                 # Re-iterate items to build groups
                 # Warning: The original loop structure aggregated *all* notes into real_notes
                 # effectively flattening the structure, but we need to respect the grouping structure
                 # derived from the 'non_spaced_unit' items (which are Neumes/Groups).
                 
                 # New logic: Recalculate group segments based on unit_notes structure?
                 # Actually, unit_notes is already flattened from 'non_spaced_unit'.
                 # We need to map 'real_notes' back to the groups.
                 
                 # Let's rebuild the group_segments logic properly using the same extraction
                 
                 current_note_idx = 0
                 for item in non_spaced_unit:
                     g_notes_raw = extract_notes_from_element(item)
                     if not g_notes_raw: continue
                     
                     segment = []
                     for _ in g_notes_raw:
                         if current_note_idx < len(real_notes):
                             segment.append(real_notes[current_note_idx])
                             current_note_idx += 1
                     
                     if segment:
                         group_segments.append(segment)
                 
                 pat_str = ""
                 if group_segments:
                     parts = []
                     prev_last_note = None
                     
                     for i, grp in enumerate(group_segments):
                         is_group = len(grp) > 1
                         if i == 0:
                             if is_group: parts.append("[")
                             parts.append("*" + get_suffix(grp[0]["type"], grp[0]["liquescent"]))
                         else:
                             if prev_last_note is not None:
                                 link_dir = get_direction(prev_last_note["pitch"], grp[0]["pitch"])
                                 parts.append(link_dir + get_suffix(grp[0]["type"], grp[0]["liquescent"]))
                             if is_group: parts.append("[")
                         
                         if len(grp) >= 2:
                             for k in range(len(grp)-1):
                                 d = get_direction(grp[k]["pitch"], grp[k+1]["pitch"])
                                 parts.append(d + get_suffix(grp[k+1]["type"], grp[k+1]["liquescent"]))
                         
                         if is_group: parts.append("]")
                         prev_last_note = grp[-1]

                     pat_str = "".join(parts)

                     doc_id = "unknown"
                     if hasattr(doc, "meta"):
                        if hasattr(doc.meta, "document_id"):
                            doc_id = str(doc.meta.document_id)
                        else:
                            doc_id = getattr(doc.meta, "document_id", "unknown")

                     notes_str = "-".join([f"{n['base']}{n['octave']}" for n in real_notes])
                     info_compact = [
                         doc_id,
                         str(current_context["folio"]),
                         str(current_context["line"]),
                         str(current_context["syllable"]),
                         notes_str
                     ]
                     results[source][pat_str].append(info_compact)

        if hasattr(doc, "data"):
            # Initial Metadata
            if hasattr(doc, "meta"):
                 current_context["folio"] = getattr(doc.meta, "initial_folio", "")
                 current_context["line"] = getattr(doc.meta, "initial_line", "0")
            
            traverse(doc.data)
        
    return results

def export_json(data):
    # COMPACT JSON: Convert defaultdict to regular dict
    data_js = json.loads(json.dumps(data))
    
    sources = sorted(data_js.keys())
    
    # Collect all unique patterns and their stats
    all_patterns = set()
    pat_stats = defaultdict(lambda: {"count": 0, "length": 0})
    
    overall_max = 0

    for src in sources:
        for pat, occurrences in data_js[src].items():
            all_patterns.add(pat)
            count = len(occurrences)
            pat_stats[pat]["count"] += count
            pat_stats[pat]["length"] = len(pat)
            if count > overall_max:
                overall_max = count
    
    # Load Glyphs
    glyphs = {}
    glyph_files = {
        "note": "glyphs/note.svg",
        "oriscus": "glyphs/oriscus.svg",
        "quilisma": "glyphs/quilisma.svg",
        "ascending": "glyphs/ascending.svg",
        "descending": "glyphs/descending.svg",
        "strophicus": "glyphs/strophicus.svg"
    }
    
    for name, path in glyph_files.items():
        if os.path.exists(path):
            with open(path, "r") as f:
                content = f.read()
                # Extract viewBox
                vb = "0 0 10 10"
                m_vb = re.search(r'viewBox="([^"]+)"', content)
                if m_vb: vb = m_vb.group(1)
                
                # Extract Path d
                m_d = re.search(r' d="([^"]+)"', content)
                d_val = ""
                if m_d: d_val = m_d.group(1)
                
                glyphs[name] = {"viewBox": vb, "d": d_val}
        else:
             glyphs[name] = {"viewBox": "0 0 10 10", "d": "M5,5 L10,10"}

    # Load Metadata (Quellendaten)
    manifest_map = {}
    try:
        excel_path = "data/raw/Quellendaten.xlsx"
        if os.path.exists(excel_path):
            df = pd.read_excel(excel_path)
            if "Quellensigle" in df.columns and "Manifest" in df.columns:
                for _, row in df.iterrows():
                    sigle = row["Quellensigle"]
                    manifest = row["Manifest"]
                    if pd.notna(manifest):
                        manifest_map[sigle] = {"url": manifest}
        else:
            print(f"Warning: {excel_path} not found.")
    except Exception as e:
        print(f"Warning: Could not load Quellendaten.xlsx: {e}")

    # Construct Final Export Object
    export_obj = {
        "data": data_js,
        "stats": pat_stats,
        "overallMax": overall_max,
        "glyphs": glyphs,
        "manifests": manifest_map
    }
    
    # Ensure ui/public exists
    os.makedirs("ui/public", exist_ok=True)
    output_file = "ui/public/data.json"
    
    with open(output_file, "w") as f:
        json.dump(export_obj, f)
    
    print(f"Exported JSON to {output_file}")


def load_or_process_data(cache_file):
    if os.path.exists(cache_file):
        print(f"Loading data from cache: {cache_file} ...")
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)
            print("Loaded data from cache.")
            return data
        except Exception as e:
            print(f"Error loading cache: {e}. Reprocessing...")
    
    return analyze_corpus("export")


def analyze_corpus(corpus_path="export"):
    # Aggregated results
    final_results = defaultdict(lambda: defaultdict(list))
    
    source_dirs = []
    if os.path.isfile(os.path.join(corpus_path, "meta.json")):
        source_dirs.append(corpus_path)
    else:
        # If corpus_path is a directory of sources
        # Strip trailing slash
        c_path = corpus_path.rstrip("/")
        # Look for meta.json in immediate subdirectories
        candidates = glob.glob(os.path.join(c_path, "*", "meta.json"))
        source_dirs = sorted([os.path.dirname(p) for p in candidates])
        print(f"Found {len(source_dirs)} sources in {corpus_path}")

    total = len(source_dirs)
    for i, src in enumerate(source_dirs):
        # print(f"--- Processing Source {i+1}/{total}: {os.path.basename(src)} ---")
        try:
            # Call the single source analyzer
            # Note: analyze_single_source must return results!
            src_results = analyze_single_source(src)
            
            # Merge results
            for source_name, patterns in src_results.items():
                for pat, occurrences in patterns.items():
                    final_results[source_name][pat].extend(occurrences)
                    
        except Exception as e:
            print(f"Error processing {src}: {e}")
            
    # Cache the results
    print(f"Saving data to cache: {CACHE_FILE} ...")
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(final_results, f)
        print("Data cached.")
    except Exception as e:
        print(f"Warning: Could not save cache: {e}")

    return final_results


if __name__ == "__main__":
    # Load from cache or process
    results = load_or_process_data(CACHE_FILE)
    export_json(results)
