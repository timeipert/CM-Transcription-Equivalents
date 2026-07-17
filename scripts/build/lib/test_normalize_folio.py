import unittest
from analyze_transcriptions import normalize_folio

class TestNormalizeFolio(unittest.TestCase):
    def test_null_empty(self):
        self.assertEqual(normalize_folio(None), "")
        self.assertEqual(normalize_folio(""), "")
        self.assertEqual(normalize_folio("   "), "")

    def test_pure_digits(self):
        self.assertEqual(normalize_folio("10"), "10r")
        self.assertEqual(normalize_folio("34"), "34r")
        self.assertEqual(normalize_folio("91"), "91r")
        
    def test_explicit_r_v(self):
        self.assertEqual(normalize_folio("10r"), "10r")
        self.assertEqual(normalize_folio("10v"), "10v")
        self.assertEqual(normalize_folio("34r"), "34r")
        
    def test_recto_verso(self):
        self.assertEqual(normalize_folio("10 recto"), "10r")
        self.assertEqual(normalize_folio("10 verso"), "10v")
        self.assertEqual(normalize_folio("10recto"), "10r")
        self.assertEqual(normalize_folio("10verso"), "10v")
        
    def test_leading_page_markers(self):
        self.assertEqual(normalize_folio("p. 10"), "10r")
        self.assertEqual(normalize_folio("p 10"), "10r")
        self.assertEqual(normalize_folio("p. 10v"), "10v")
        
    def test_leading_zeros(self):
        self.assertEqual(normalize_folio("010"), "10r")
        self.assertEqual(normalize_folio("0010v"), "10v")
        
    def test_parentheses(self):
        self.assertEqual(normalize_folio("(10)"), "10r")
        self.assertEqual(normalize_folio("(10)v"), "10v")
        
    def test_structural_suffixes(self):
        self.assertEqual(normalize_folio("10-a"), "10r")
        self.assertEqual(normalize_folio("10/1"), "10r")
        self.assertEqual(normalize_folio("10r-a"), "10r")
        self.assertEqual(normalize_folio("10v/2"), "10v")
        
    def test_trailing_column_letters(self):
        self.assertEqual(normalize_folio("22b"), "22r")
        self.assertEqual(normalize_folio("10r a"), "10r")
        self.assertEqual(normalize_folio("10v b"), "10v")
        self.assertEqual(normalize_folio("12 a"), "12r")

if __name__ == '__main__':
    unittest.main()
