---
name: design-issue-solver
description: Identify and fix visual design discrepancies between a project UI and Figma designs. Use when asked to compare screenshots to Figma, audit UI styling, or adjust layout, typography, colors, spacing, or component sizing to match Figma.
---

# Design-IssueSolver Skill

A skill to identify and fix design discrepancies between your project and Figma designs.

## User-Invocable

Invoke this skill by typing `/design-issue-solver`.

## Instructions

When invoked, follow this workflow:

### Step 1: Gather Information

Ask the user for:
1. **Design Issue Image/Screenshot**: Request the user to provide a screenshot or image showing the current design issue in their project. They can provide a file path or paste the image.
2. **Figma Design Link**: Request the Figma link that contains the correct/expected design.

Use this prompt:
```
I'll help you fix design discrepancies between your project and the Figma design.

Please provide:
1. **Screenshot of the design issue**: Share a screenshot or file path showing the current state of your project's design that needs fixing.
2. **Figma link**: Share the Figma design link that shows how it should look.
```

### Step 2: Analyze Both Designs

Once you have both:
1. Use the `Read` tool to view the project screenshot if a file path is provided
2. Use `mcp__figma-desktop__get_design_context` or `mcp__figma-desktop__get_screenshot` to fetch the Figma design details
3. Compare the two designs thoroughly

### Step 3: Identify Discrepancies

Create a detailed comparison noting:
- Color differences (hex values, opacity)
- Spacing/margin/padding issues
- Font sizes, weights, and families
- Border radius values
- Shadow effects
- Layout/positioning differences
- Component sizing issues
- Any missing or extra elements

### Step 4: Locate Project Files

Use the `Glob` and `Grep` tools to find the relevant component/page files in the user's project that need modification.

### Step 5: Fix the Design

For each discrepancy found:
1. Show the user what needs to change
2. Use the `Edit` tool to update CSS/styling in the project files
3. Match the Figma design values exactly (colors, spacing, fonts, etc.)

### Step 6: Verify Changes

After making changes:
1. If the dev server is running, use Chrome DevTools MCP to take a screenshot
2. Compare the updated design with the Figma design
3. If there are still discrepancies, repeat the fix process
4. Continue until the project design matches the Figma design exactly

### Key Tools to Use

- `Read` - View screenshot files
- `mcp__figma-desktop__get_design_context` - Get Figma design code and details
- `mcp__figma-desktop__get_screenshot` - Get Figma design screenshot
- `mcp__figma-desktop__get_variable_defs` - Get design tokens/variables
- `Glob` / `Grep` - Find project files to edit
- `Edit` - Modify CSS/styling code
- `mcp__chrome-devtools__take_screenshot` - Capture current state of running app
- `mcp__chrome-devtools__take_snapshot` - Get DOM snapshot for comparison

### Important Notes

- Always extract exact values from Figma (colors, spacing, fonts)
- Prefer using design tokens/variables if the project has them
- Maintain consistency with the project's existing code style
- Test changes in the browser after each modification
- Don't stop until the design matches the Figma exactly
