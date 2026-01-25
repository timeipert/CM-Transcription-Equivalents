
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
    t = note_type
    l = is_liquescent
    
    if t == "Oriscus": s += "O"
    elif t == "Quilisma": s += "Q"
    elif t == "Liquescent": s += "L" 
    elif t == "Strophicus": s += "S"
    
    if l and "L" not in s: s += "L" 
    return s
