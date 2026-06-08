--- recto-start.lua
--- Pandoc Lua filter: Forces chapter starts (H1 headings) to begin on
--- odd (recto) pages in DOCX output.
---
--- Injects a raw OOXML section break with type "oddPage" before each
--- Header level 1 element.
---
--- DOCX-only: EPUB splits by chapter natively, and Typst templates handle
--- recto starts through their own page configuration.
---
--- Draft mode: Skips recto-start when metadata flag `draft-mode` is true.
--- Draft mode omits typesetting niceties per locked decision.
---
--- Filter order in pipeline: 6th (conditional, DOCX final mode only)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

local draft_mode = false

--- Read draft-mode flag from document metadata.
local function Meta(meta)
  if meta["draft-mode"] then
    draft_mode = pandoc.utils.stringify(meta["draft-mode"]) == "true"
  end
end

--- Inject oddPage section break before H1 headers in DOCX format.
--- @param el pandoc.Header The header element to process
--- @return pandoc.List|nil List with section break + header, or nil for pass-through
local function Header(el)
  -- Only apply to H1 (chapter headings)
  if el.level ~= 1 then
    return nil
  end

  -- Only apply for DOCX format
  if not FORMAT:match 'docx' then
    return nil
  end

  -- Skip in draft mode (per locked decision: draft skips typesetting niceties)
  if draft_mode then
    return nil
  end

  -- OOXML section break forcing odd (recto) page start
  local ooxml = '<w:p><w:pPr><w:sectPr><w:type w:val="oddPage"/></w:sectPr></w:pPr></w:p>'
  local section_break = pandoc.RawBlock('openxml', ooxml)

  -- Return the section break followed by the header
  return {section_break, el}
end

-- Two-pass filter: Meta reads draft-mode flag first, then Header processes H1 elements
return {{Meta = Meta}, {Header = Header}}
