"""Line numbers of occurrences when a rubric holds page-change marks (`||`).

The edition marks a line change with `|` and a page change with `||`. A rubric such as
`|| TROPHA (|| f. 374v-b)` stands at the start of a page, so it must not move the line number on.
The rule `rubric_page_break` (scripts/analysis_rules.json) switches that reading on per source.
"""
import json
import os
import sys

import pytest

# In front of site-packages: `pip install ./scripts/` leaves copies of the modules there, which do not sit next to analysis_rules.json.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../scripts")))

import analyze_transcriptions
from logic import count_line_breaks, load_analysis_rules, rule_applies

RUBRIC = "|| TROPHA (|| f. 374v-b)"


def test_original_rule_counts_every_bar():
    assert count_line_breaks("| VERSUS") == 1
    assert count_line_breaks(RUBRIC) == 4
    assert count_line_breaks("DIACO- | NO DI- | CENTE") == 2


def test_page_marks_are_no_line_breaks_when_the_rule_is_on():
    assert count_line_breaks(RUBRIC, True) == 0
    assert count_line_breaks("|| IN NATALE (|| f. 375)", True) == 0
    assert count_line_breaks("| VERSUS", True) == 1
    assert count_line_breaks("DIACO- | NO DI- | CENTE", True) == 2
    assert count_line_breaks("A | B || C | D", True) == 2
    assert count_line_breaks("no bars", True) == 0


def test_rule_applies_by_name_or_to_all_sources():
    rules = {"rubric_page_break": {"sources": ["Vat 3797"]}, "other": {"sources": "*"}}
    assert rule_applies(rules, "rubric_page_break", "Vat 3797")
    assert not rule_applies(rules, "rubric_page_break", "Aa 13")
    assert rule_applies(rules, "other", "Aa 13")
    assert not rule_applies(rules, "missing", "Aa 13")


def test_shipped_rules_file_switches_the_rule_on_for_vat_3797_only():
    rules = load_analysis_rules()
    assert rule_applies(rules, "rubric_page_break", "Vat 3797")
    assert not rule_applies(rules, "rubric_page_break", "Aa 13")


def syllable(text, base="C", octave=4):
    return {
        "kind": "Syllable", "syllableType": "Normal", "text": text,
        "notes": {"spaced": [{"nonSpaced": [{"grouped": [{"base": base, "octave": octave, "noteType": "Normal", "liquescent": False}]}]}]},
    }


def make_source(root, source, rubric, first_line):
    """One source with one document: a rubric, two syllables, a line change, one syllable."""
    src = root / source
    doc = src / "doc-1"
    doc.mkdir(parents=True)
    (src / "meta.json").write_text(json.dumps({
        "id": source, "quellensigle": source, "herkunftsregion": "", "herkunftsort": "", "herkunftsinstitution": "",
        "ordenstradition": "", "quellentyp": "", "bibliotheksort": "", "bibliothek": "", "bibliothekssignatur": "",
        "kommentar": "", "datierung": "", "status": "", "jahrhundert": "", "manifest": "", "foliooffset": "", "publish": "all",
    }))
    (doc / "meta.json").write_text(json.dumps({
        "id": "doc-1", "quelle_id": source, "dokumenten_id": f"{source}-374v-b-1", "gattung1": "Tropus", "gattung2": "",
        "festtag": "", "feier": "", "textinitium": "", "bibliographischerverweis": "", "druckausgabe": "",
        "zeilenstart": str(first_line), "foliostart": "374v-b", "kommentar": "", "editionsstatus": "ediert", "additionalData": {},
    }))
    (doc / "data.json").write_text(json.dumps({
        "comments": [], "uuid": "root", "kind": "RootContainer", "documentType": "chant", "version": "1",
        "children": [
            {"kind": "ParatextContainer", "text": rubric, "paratextType": "Gesang", "children": []},
            {"kind": "ZeileContainer", "children": [syllable("Ait"), syllable("be-")]},
            {"kind": "LineChange", "children": []},
            {"kind": "ZeileContainer", "children": [syllable("a-")]},
        ],
    }))
    return str(src)


def lines_of(path):
    results = analyze_transcriptions.analyze_single_source(path)
    return sorted({int(occurrence[2]) for patterns in results.values() for occ in patterns.values() for occurrence in occ})


@pytest.mark.parametrize("rule_on, expected", [(False, [5, 6]), (True, [1, 2])])
def test_first_line_of_a_document_with_a_page_mark_rubric(tmp_path, monkeypatch, rule_on, expected):
    monkeypatch.setattr(analyze_transcriptions, "ANALYSIS_RULES", {"rubric_page_break": {"sources": ["Test 1"] if rule_on else []}})
    assert lines_of(make_source(tmp_path, "Test 1", RUBRIC, 1)) == expected


def test_a_source_the_rule_does_not_list_keeps_the_original_numbering(tmp_path, monkeypatch):
    monkeypatch.setattr(analyze_transcriptions, "ANALYSIS_RULES", {"rubric_page_break": {"sources": ["Other"]}})
    assert lines_of(make_source(tmp_path, "Test 1", RUBRIC, 1)) == [5, 6]


def test_document_scope_keeps_the_edition_and_documents_without_the_field():
    from logic import document_in_scope
    rules = {"document_scope": {"subcorpora": ["edition"], "publish": ["all", "none"]}}
    assert document_in_scope(rules, "edition", "all")
    assert document_in_scope(rules, "edition", "none")
    assert not document_in_scope(rules, "transkription", "all")
    assert not document_in_scope(rules, "edition", "meta-only")
    assert document_in_scope(rules, None, None)      # an older export has neither field
    assert document_in_scope({}, "transkription", "none")  # no rule, no restriction
