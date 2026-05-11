# Equivalents Management

The **Equivalents Management** view is the control center for your transcription analysis. This is where you establish the formal link between an abstract musical concept (the transcription pattern) and its physical identifier (the Ref ID).

## Understanding the Table

When you open the Equivalents view, you will see a large data table.

- **Pattern**: The transcription data sequence (e.g., a Volpiano string like `1---c--d---3`).
- **Occurrences**: How many times this exact pattern appears across all your loaded transcription datasets.
- **Global ID**: The project-wide Reference ID assigned to this pattern.
- **Local IDs**: A list of manuscript-specific overrides, if any.
- **Notes**: A text field for your personal observations about this pattern.

## Assigning Global IDs

To categorize a new pattern:
1. Locate a pattern you want to categorize in the table. You can use the search bar to filter for specific strings.
2. Click into the **Global ID** cell for that row.
3. Type your chosen Reference ID (e.g., `25`, `14a`).
4. Press `Enter` or click outside the cell to save. 

The tool will now associate every occurrence of that pattern with that Ref ID across all manuscripts (unless overridden).

## Managing Local Overrides

Sometimes a specific manuscript writes a standard musical gesture in a non-standard way. You can document this using a Local Override.

1. Click the `+` or edit icon in the **Local IDs** column for a specific pattern.
2. A modal will appear allowing you to select a specific manuscript from your directory.
3. Enter the overriding Ref ID for that specific manuscript.
4. Save the change.

Now, whenever you encounter that pattern in that specific manuscript, it will be labeled with the Local ID instead of the Global ID.

## Filtering and Searching

The search bar at the top of the table allows you to quickly find patterns. 
- You can search by the pattern string itself to find related musical gestures.
- You can search by Ref ID to see all patterns assigned to a specific graphical shape.
