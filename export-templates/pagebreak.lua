--- pagebreak.lua
--- Pandoc Lua filter: Converts \newpage commands to format-specific page breaks
--- across DOCX, EPUB/HTML, PDF (Typst), and LaTeX output.
---
--- Detects \newpage in two forms:
---   1. RawBlock with LaTeX format containing \newpage
---   2. Para containing only the text "\newpage"
---
--- Based on the pandoc-ext/pagebreak approach, implemented inline to avoid
--- external dependency.
---
--- Filter order in pipeline: 3rd (runs after first-para.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

--- Generate a format-specific page break block.
--- @return pandoc.Block The page break in the current output format
local function make_pagebreak()
  if FORMAT:match 'docx' then
    -- DOCX: Raw OOXML page break element
    return pandoc.RawBlock('openxml',
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    -- EPUB/HTML: Div with CSS page-break-after
    return pandoc.RawBlock('html',
      '<div class="page-break" style="page-break-after: always;"></div>')

  elseif FORMAT:match 'typst' then
    -- Typst (PDF via Typst engine): Typst pagebreak command
    return pandoc.RawBlock('typst', '#pagebreak()')

  elseif FORMAT:match 'latex' then
    -- LaTeX: Pass through as-is (already valid LaTeX)
    return pandoc.RawBlock('latex', '\\newpage')

  else
    -- Unknown format: return empty block
    return pandoc.Para({})
  end
end

--- Check RawBlock elements for \newpage commands.
--- Handles RawBlocks with LaTeX format that contain \newpage.
--- @param el pandoc.RawBlock The raw block to check
--- @return pandoc.Block|nil Replacement block or nil to pass through
local function RawBlock(el)
  if el.format:match 'latex' or el.format:match 'tex' then
    if el.text:match '\\newpage' then
      return make_pagebreak()
    end
  end
  return nil
end

--- Check Para elements for \newpage text.
--- Handles paragraphs that contain only the text "\newpage".
--- @param el pandoc.Para The paragraph to check
--- @return pandoc.Block|nil Replacement block or nil to pass through
local function Para(el)
  -- Check if paragraph contains only a single Str element with \newpage
  if #el.content == 1 and el.content[1].t == 'Str' then
    if el.content[1].text:match '^\\newpage$' then
      return make_pagebreak()
    end
  end

  -- Also check for RawInline containing \newpage
  if #el.content == 1 and el.content[1].t == 'RawInline' then
    if el.content[1].text:match '\\newpage' then
      return make_pagebreak()
    end
  end

  return nil
end

return {{RawBlock = RawBlock, Para = Para}}
