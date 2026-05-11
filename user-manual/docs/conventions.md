# Conventions & Terminology

To use the tool effectively, it is important to understand the terminology and data conventions it employs.

## Patterns (Transcriptions)
A **Pattern** refers to a sequence of abstract musical data from a transcription. Depending on your source data, this might be represented as a string of characters (e.g., Volpiano fonts) or structured data (e.g., MEI elements). The tool groups identical transcription sequences into unique patterns so you can analyze their graphical realizations.

## Reference IDs (Ref IDs)
A **Reference ID** (or Ref ID) is a stable identifier that you assign to a specific graphical shape or neume type. 
- For example, you might decide that the standard *Clivis* in your repertoire is designated as Ref ID `10`.
- This allows for a standardized numbering system across different manuscript sources. A `10` in Manuscript A is intended to be the same graphical concept as a `10` in Manuscript B.

## Variants
Often, a single Ref ID will have slight graphical variations. The tool supports **Variants** using alphabetical suffixes.
- For example, if Ref ID `10` has two distinct visual forms, you might classify them as `10a` and `10b`.
- The tool can extract these suffixes automatically if they are included in your linked transcription data, or you can manually assign them during annotation.

## Global vs. Local Identifiers
Because manuscript notation can be idiosyncratic, the tool supports a two-tiered identification system:
1. **Global IDs**: These are the default, project-wide identifiers assigned to a pattern. If an abstract transcription pattern almost always corresponds to Ref ID `12`, you set `12` as the Global ID.
2. **Local Overrides**: If a specific manuscript uses a different graphical sign for that same musical pattern, you can assign a manuscript-specific Local ID that overrides the Global ID just for that source.

## IIIF (International Image Interoperability Framework)
The tool relies on **IIIF Manifests** to load manuscript images. IIIF is a standardized method used by major libraries (e.g., BnF, Gallica, specialized university archives) to serve high-resolution images over the web. You do not need to download gigabytes of images; simply provide the manifest URL.
