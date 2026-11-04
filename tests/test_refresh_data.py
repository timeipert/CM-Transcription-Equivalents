"""The pure parts of scripts/refresh_data.py: comparing two analyses, the manifest truth file, writing data."""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../scripts")))

import refresh_data as rd


def rows(*items):
    """{pattern: [[doc, folio, line, syllable, notes], ...]} from (pattern, doc, folio, line, syllable, notes)."""
    out = {}
    for pattern, doc, folio, line, syllable, notes in items:
        out.setdefault(pattern, []).append([doc, folio, line, syllable, notes])
    return out


def test_an_identical_analysis_is_unchanged_whatever_the_order():
    a = rows(("*", "D-1", "1r", "1", "Ky", "C4"), ("*", "D-2", "1r", "2", "ri", "D4"))
    b = rows(("*", "D-2", "1r", "2", "ri", "D4"), ("*", "D-1", "1r", "1", "Ky", "C4"))
    assert rd.is_unchanged(rd.diff_source(a, b))


def test_a_corrected_page_break_moves_rows_and_is_not_a_removal():
    old = rows(("*", "D-1", "155r", "9", "Ie-", "C4"))
    new = rows(("*", "D-1", "155v", "1", "Ie-", "C4"))
    d = rd.diff_source(old, new)
    assert len(d["moved"]) == 1 and not d["removed"] and not d["added"]
    key, before, after = d["moved"][0]
    assert before == ("155r", "9") and after == ("155v", "1")


def test_new_and_withdrawn_documents_show_as_added_and_removed():
    old = rows(("*", "D-1", "1r", "1", "Ky", "C4"))
    new = rows(("*", "D-2", "1r", "1", "Ky", "C4"))
    d = rd.diff_source(old, new)
    assert d["docs_added"] == ["D-2"] and d["docs_removed"] == ["D-1"]
    assert len(d["removed"]) == 1 and len(d["added"]) == 1


def test_identical_rows_of_one_document_are_followed_one_by_one():
    old = rows(("*", "D-1", "1r", "1", "a", "C4"), ("*", "D-1", "1r", "2", "a", "C4"))
    new = rows(("*", "D-1", "1r", "1", "a", "C4"), ("*", "D-1", "1r", "3", "a", "C4"))
    d = rd.diff_source(old, new)
    assert len(d["moved"]) == 1 and not d["removed"] and not d["added"]


def test_canonical_form_is_sorted_and_stable():
    out = rd.canonical({"b": [["D-2", "1r", "1", "x", "C4"], ["D-1", "1r", "1", "y", "C4"]], "a": [["D-1", "1r", "1", "z", "C4"]]})
    assert list(out) == ["a", "b"]
    assert [r[0] for r in out["b"]] == ["D-1", "D-2"]


def test_the_truth_file_decides_and_export_and_table_only_fill_gaps():
    export_meta = {"A": {"manifest": "https://export/a"}, "B": {"manifest": ""}, "C": {"manifest": "not a url"}, "E": {"manifest": "https://export/e"}}
    table = {"D": "https://table/d", "A": "https://table/a"}
    truth = {"A": {"url": "https://truth/a"}, "C": {"url": "https://truth/c"}, "M": {"url": "manifests/m.json", "vendored_from": "https://library/m"}}
    manifests, differences = rd.build_manifests(export_meta, table, truth)
    assert {s: e["url"] for s, e in manifests.items()} == {
        "A": "https://truth/a",      # the truth file wins over export and table
        "C": "https://truth/c",
        "M": "manifests/m.json",
        "E": "https://export/e",     # a gap in the truth file is filled from the export
        "D": "https://table/d",      # ... or from the table
    }
    assert ("A", "https://truth/a", "https://export/a", "export") in differences
    assert ("A", "https://truth/a", "https://table/a", "table") in differences
    assert ("E", None, "https://export/e", "export") in differences
    assert not [d for d in differences if d[0] in ("B", "C")]   # no link / no URL: nothing to report


def test_a_copied_manifest_agrees_with_the_library_url_it_was_copied_from():
    export_meta = {"M": {"manifest": "https://library/m"}}
    truth = {"M": {"url": "manifests/m.json", "vendored_from": "https://library/m"}}
    assert rd.build_manifests(export_meta, {}, truth)[1] == []


def test_source_names_are_nfc_and_slash_is_restored():
    assert rd.source_name("Mu\u0308 4101") == "M\u00fc 4101"
    assert rd.source_name(" WiSch 4#slash5 ") == "WiSch 4/5"


def test_data_is_written_once_and_vanished_sources_are_removed(tmp_path):
    final = {"Aa 13": {"*": [["Aa 13-1", "1r", "1", "Ky", "C4"]]}, "WiSch 4/5": {"*": [["W-1", "2r", "1", "a", "D4"]]}}
    written, removed = rd.write_data(str(tmp_path), final, {"sources": ["Aa 13", "WiSch 4/5"]})
    assert sorted(written) == ["Aa 13", "WiSch 4/5", "counts.json", "index.json"] and not removed
    assert (tmp_path / "sources" / "WiSch 4_5.json").exists()           # a slash in a name becomes "_"
    written, removed = rd.write_data(str(tmp_path), {"Aa 13": final["Aa 13"]}, {"sources": ["Aa 13"]})
    assert sorted(written) == ["counts.json", "index.json"] and removed == ["WiSch 4_5.json"]   # Aa 13 unchanged: not rewritten
    assert json.loads((tmp_path / "index.json").read_text()) == {"sources": ["Aa 13"]}


def test_counts_json_holds_the_number_of_occurrences_per_source_and_pattern(tmp_path):
    final = {
        "WiSch 4/5": {"*u": [["W-1", "2r", "1", "a", "D4"]]},
        "Aa 13": {"*": [["Aa 13-1", "1r", "1", "Ky", "C4"], ["Aa 13-1", "1r", "2", "ri", "C4"]], "*ud": [["Aa 13-2", "1v", "1", "e", "D4"]]},
    }
    rd.write_data(str(tmp_path), final, {"sources": sorted(final)})
    text = (tmp_path / "counts.json").read_text()
    assert json.loads(text) == {"Aa 13": {"*": 2, "*ud": 1}, "WiSch 4/5": {"*u": 1}}   # keyed by the real name, slash included
    assert " " not in text.replace("Aa 13", "").replace("WiSch 4/5", "")                  # compact: no padding
    # Every count is the length of the matching list in sources/<source>.json, which the matrix no longer loads.
    for source, patterns in json.loads(text).items():
        rows = json.loads((tmp_path / "sources" / rd.file_name(source)).read_text())
        assert patterns == {pattern: len(occurrences) for pattern, occurrences in rows.items()}


def test_a_source_without_occurrences_gets_an_empty_row_in_counts():
    import analyze_transcriptions as analysis
    assert analysis.build_source_counts({"Empty 1": {}}) == {"Empty 1": {}}
