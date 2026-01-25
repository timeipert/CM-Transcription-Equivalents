
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts')))

from logic import pitch_to_midi, get_direction, get_suffix

def test_pitch_to_midi():
    assert pitch_to_midi('C', 4) == 48
    assert pitch_to_midi('A', 4) == 57
    assert pitch_to_midi('B', 3) == 47

def test_get_direction():
    assert get_direction(48, 50) == "u"
    assert get_direction(50, 48) == "d"
    assert get_direction(48, 48) == "e"

def test_get_suffix():
    assert get_suffix("Oriscus", False) == "O"
    assert get_suffix("Quilisma", False) == "Q"
    assert get_suffix("Normal", True) == "L"
    assert get_suffix("Oriscus", True) == "OL"

if __name__ == "__main__":
    test_pitch_to_midi()
    test_get_direction()
    test_get_suffix()
    print("All logic tests passed!")
