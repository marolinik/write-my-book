--- scene-break.lua
--- Pandoc Lua filter: Converts HorizontalRule elements (from *** in markdown)
--- to ornamental scene breaks across DOCX, EPUB/HTML, and PDF (Typst) output.
---
--- Reads the ornament glyph from Pandoc metadata key `scene-break-ornament`.
--- Default ornament: U+2726 (four-pointed star).
---
--- Filter order in pipeline: 1st (runs before first-para.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

local ornament = "\xe2\x9c\xa6" -- U+2726 four-pointed star (UTF-8 encoded)

--- Read ornament glyph from document metadata.
--- Called before any block processing via the two-pass filter return.
local function Meta(meta)
  if meta["scene-break-ornament"] then
    ornament = pandoc.utils.stringify(meta["scene-break-ornament"])
  end
end

--- Convert HorizontalRule to format-specific ornamental scene break.
local function HorizontalRule()
  if FORMAT:match 'docx' then
    -- DOCX: Para with custom-style span (reference doc defines Scene Break as centered)
    local span = pandoc.Span(ornament, pandoc.Attr('', {}, {{'custom-style', 'Scene Break'}}))
    return pandoc.Para({span})

  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    -- EPUB/HTML: Div with role="separator" and CSS class for styling
    local html = '<div class="scene-break" role="separator">' .. ornament .. '</div>'
    return pandoc.RawBlock('html', html)

  elseif FORMAT:match 'typst' then
    -- Typst (PDF via Typst engine): centered ornament with vertical spacing
    local typst_code = '#v(1em)\n#align(center)[#text(size: 14pt)[' .. ornament .. ']]\n#v(1em)'
    return pandoc.RawBlock('typst', typst_code)

  elseif FORMAT:match 'latex' then
    -- LaTeX (PDF via LaTeX engine): centered ornament with vertical spacing
    local latex_code = '\\vspace{1em}\n\\begin{center}\\large ' .. ornament .. '\\end{center}\n\\vspace{1em}'
    return pandoc.RawBlock('latex', latex_code)

  else
    -- Unknown format: return a plain paragraph with ornament text
    return pandoc.Para({pandoc.Str(ornament)})
  end
end

-- Two-pass filter: Meta runs first to capture ornament, then HorizontalRule processes breaks
return {{Meta = Meta}, {HorizontalRule = HorizontalRule}}
