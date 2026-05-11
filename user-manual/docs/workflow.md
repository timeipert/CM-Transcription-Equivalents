# Core Workflow

The typical research process follows these three main steps:

## 1. Equivalents Management
Before annotating scans, you define the "Equivalents" – the mapping between abstract transcription patterns and their reference identifiers.
- **Reference IDs (Ref IDs)**: Unique keys (e.g., `123`, `45a`) that identify a specific graphical shape.
- **Global IDs**: Shared across the entire project.

## 2. Manuscript Annotation
Once patterns are defined, you can link them to physical scans:
1. **Open the Polygon Editor**: Load a manuscript via its IIIF manifest.
2. **Define Line Regions**: Draw rectangular boxes around lines of music/text.
3. **Annotate Signs**: Select a region and link it to a specific pattern from your transcriptions.

## 3. Deployment
Finally, generate public-facing documentation:
- The tool exports a `data.json` containing all mappings.
- The `public` view provides a gallery for external users to explore your findings.
