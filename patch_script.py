import re

with open("scripts/analyze_transcriptions.py", "r") as f:
    content = f.read()

# Add argparse and REPO_ROOT
content = content.replace("import monodikit\n", "import argparse\nimport monodikit\n")
content = content.replace("import pandas as pd\n", "import pandas as pd\nimport os\n\nREPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))\n")

# Remove hardcoded CACHE_FILE
content = re.sub(r'CACHE_FILE = "transcription_cache.json"\n+', '', content)

# Replace analyze_corpus
analyze_corpus_old = """def analyze_corpus(corpus_path="export"):
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

    return final_results"""

analyze_corpus_new = """def analyze_corpus(corpus_path, cache_file):
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
    failures = []
    for i, src in enumerate(source_dirs):
        try:
            src_results = analyze_single_source(src)
            for source_name, patterns in src_results.items():
                for pat, occurrences in patterns.items():
                    final_results[source_name][pat].extend(occurrences)
        except Exception as e:
            failures.append((src, e))
            print(f"Error processing {src}: {e}")
            
    print(f"Processed {total} sources, {len(failures)} failed: {[os.path.basename(f[0]) for f in failures]}")
    
    # Cache the results
    print(f"Saving data to cache: {cache_file} ...")
    try:
        with open(cache_file, "w") as f:
            json.dump(final_results, f)
        print("Data cached.")
    except Exception as e:
        print(f"Warning: Could not save cache: {e}")

    return final_results"""

if analyze_corpus_old in content:
    content = content.replace(analyze_corpus_old, analyze_corpus_new)
else:
    print("Could not find analyze_corpus block!")

# Replace load_or_process_data
load_old = """def load_or_process_data(cache_file):
    if os.path.exists(cache_file):
        print(f"Loading data from cache: {cache_file} ...")
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)
            print("Loaded data from cache.")
            return data
        except Exception as e:
            print(f"Error loading cache: {e}. Reprocessing...")
    
    return analyze_corpus("export")"""

load_new = """def load_or_process_data(corpus_path, cache_file, fresh):
    if not fresh and os.path.exists(cache_file):
        print(f"Loading data from cache: {cache_file} ...")
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)
            print("Loaded data from cache.")
            return data
        except Exception as e:
            print(f"Error loading cache: {e}. Reprocessing...")
    
    return analyze_corpus(corpus_path, cache_file)"""

if load_old in content:
    content = content.replace(load_old, load_new)
else:
    print("Could not find load block!")

# Replace export_json
export_old = """def export_json(data):
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
                content_svg = f.read()
                # Extract viewBox
                vb = "0 0 10 10"
                m_vb = re.search(r'viewBox="([^"]+)"', content_svg)
                if m_vb: vb = m_vb.group(1)
                
                # Extract Path d
                m_d = re.search(r' d="([^"]+)"', content_svg)
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
    
    print(f"Exported JSON to {output_file}")"""

# We need a regex replacement for export_json because of small differences like content vs content_svg
import re
def export_replacer(match):
    return """def export_json(data, output_file):
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
        "note": os.path.join(REPO_ROOT, "glyphs/note.svg"),
        "oriscus": os.path.join(REPO_ROOT, "glyphs/oriscus.svg"),
        "quilisma": os.path.join(REPO_ROOT, "glyphs/quilisma.svg"),
        "ascending": os.path.join(REPO_ROOT, "glyphs/ascending.svg"),
        "descending": os.path.join(REPO_ROOT, "glyphs/descending.svg"),
        "strophicus": os.path.join(REPO_ROOT, "glyphs/strophicus.svg")
    }
    
    for name, path in glyph_files.items():
        if os.path.exists(path):
            with open(path, "r") as f:
                content_svg = f.read()
                # Extract viewBox
                vb = "0 0 10 10"
                m_vb = re.search(r'viewBox="([^"]+)"', content_svg)
                if m_vb: vb = m_vb.group(1)
                
                # Extract Path d
                m_d = re.search(r' d="([^"]+)"', content_svg)
                d_val = ""
                if m_d: d_val = m_d.group(1)
                
                glyphs[name] = {"viewBox": vb, "d": d_val}
        else:
             glyphs[name] = {"viewBox": "0 0 10 10", "d": "M5,5 L10,10"}

    # Load Metadata (Quellendaten)
    manifest_map = {}
    try:
        excel_path = os.path.join(REPO_ROOT, "data/raw/Quellendaten.xlsx")
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
    
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, "w") as f:
        json.dump(export_obj, f)
    
    print(f"Exported JSON to {output_file}")"""

content = re.sub(r'def export_json\(data\):.*?print\(f"Exported JSON to \{output_file\}"\)', export_replacer, content, flags=re.DOTALL)

# Replace __main__
main_old = """if __name__ == "__main__":
    # Load from cache or process
    results = load_or_process_data(CACHE_FILE)
    export_json(results)"""

main_new = """if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess chant transcription data")
    parser.add_argument("--corpus", default=os.path.join(REPO_ROOT, "export"), help="Path to corpus directory")
    parser.add_argument("--out", default=os.path.join(REPO_ROOT, "ui/public/data.json"), help="Path to output JSON")
    parser.add_argument("--cache", default=os.path.join(REPO_ROOT, "transcription_cache.json"), help="Path to cache JSON")
    parser.add_argument("--fresh", action="store_true", help="Ignore and rewrite the cache")
    args = parser.parse_args()

    results = load_or_process_data(args.corpus, args.cache, args.fresh)
    export_json(results, args.out)"""

if main_old in content:
    content = content.replace(main_old, main_new)
else:
    print("Could not find __main__ block!")

with open("scripts/analyze_transcriptions.py", "w") as f:
    f.write(content)

