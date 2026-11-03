
def pitch_to_midi(base, octave):
    """Converts a base note (A-G) and octave to a comparable integer."""
    offsets = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    base = base.upper()
    return int(octave) * 12 + offsets.get(base, 0)

def get_direction(p1, p2):
    if p2 > p1:
        return "u"
    elif p2 < p1:
        return "d"
    else:
        return "e"

def get_suffix(note_type, is_liquescent):
    """Returns the paleographic suffix for a note."""
    s = ""
    t = str(note_type).capitalize()
    l = is_liquescent
    
    if t == "Oriscus": s += "O"
    elif t == "Quilisma": s += "Q"
    elif t == "Strophicus": s += "S"
    elif t == "Ascending": s += "LA"
    elif t == "Descending": s += "LD"
    elif t == "Liquescent": s += "L"
    
    if l and "L" not in s: 
        s += "L"
    return s


# --- Line numbering inside rubrics ------------------------------------------------------------

import json
import os
import re

RULES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "analysis_rules.json")
BAR_RUN = re.compile(r"\|+")


def count_line_breaks(text, page_marker_is_no_line_break=False):
    """Number of line changes a rubric's text marks.

    In the edition's notation a single bar `|` is a line change and a double bar `||` is a page
    change (written before a rubric that starts a page, and again in a note such as
    `(|| f. 375)`). The original rule counts every bar, so each `||` moves the line number on by two.
    With `page_marker_is_no_line_break` a run of two or more bars is a page change and adds no line.
    """
    if not page_marker_is_no_line_break:
        return text.count("|")
    return sum(1 for run in BAR_RUN.findall(text) if len(run) == 1)


def load_analysis_rules(path=RULES_FILE):
    """The tracked decisions of scripts/analysis_rules.json: rule name -> {"sources": [...] | "*"}."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {name: rule for name, rule in data.get("rules", {}).items() if isinstance(rule, dict)}


def rule_applies(rules, name, source):
    """Whether rule `name` is switched on for `source` (listed by name, or `"sources": "*"` for all)."""
    sources = rules.get(name, {}).get("sources", [])
    return sources == "*" or source in sources


def document_in_scope(rules, subcorpus, publish):
    """Whether a document belongs to the data of the Neume Viewer (rule `document_scope`).

    The export holds several subcorpora of the editor (the corpus edition, transcriptions, synoptic
    gradual, ...). Only the listed ones are analysed. A document without the field (an older export) is
    kept; so is any document when the rule is absent.
    """
    scope = rules.get("document_scope")
    if not scope:
        return True
    if subcorpus is not None and subcorpus not in scope.get("subcorpora", [subcorpus]):
        return False
    if publish is not None and publish not in scope.get("publish", [publish]):
        return False
    return True
