--- epigraph.lua
--- Pandoc Lua filter: Detects epigraph patterns (blockquotes with attribution)
--- and formats them distinctly for DOCX, EPUB/HTML, and PDF (Typst) output.
---
--- Epigraph pattern: A BlockQuote where the last paragraph's text begins with
--- "--" or "---" (attribution line). Epigraphs are typically placed immediately
--- after a chapter heading (H1), but this filter formats ANY blockquote with
--- the attribution pattern as an epigraph for flexibility.
---
--- Quote text = all content except the last attribution paragraph.
--- Attribution = last paragraph text with leading dashes stripped.
---
--- Non-epigraph blockquotes (those without attribution pattern) pass through
--- unchanged.
---
--- Filter order in pipeline: 4th (runs after pagebreak.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

--- Check if a paragraph starts with an attribution marker (-- or ---).
--- @param para pandoc.Para The paragraph to check
--- @return boolean True if the paragraph is an attribution line
local function is_attribution(para)
  if not para or para.t ~= 'Para' then
    return false
  end
  local text = pandoc.utils.stringify(para)
  -- Match lines starting with em-dash, double-dash, or triple-dash
  return text:match('^%-%-%-?%s') or text:match('^\xe2\x80\x94%s') or
         text:match('^%-%-%-?$') or text:match('^\xe2\x80\x94$')
end

--- Extract attribution text from a paragraph, stripping leading dashes.
--- @param para pandoc.Para The attribution paragraph
--- @return string The cleaned attribution text
local function extract_attribution(para)
  local text = pandoc.utils.stringify(para)
  -- Strip leading dashes and whitespace
  text = text:gsub('^%-%-%-?%s*', '')
  text = text:gsub('^\xe2\x80\x94%s*', '') -- em-dash
  return text
end

--- Extract quote inlines from all paragraphs except the attribution.
--- @param blocks table List of blocks (all except last)
--- @return pandoc.List List of inline elements representing the quote
local function extract_quote_inlines(blocks)
  local inlines = pandoc.List()
  for i, block in ipairs(blocks) do
    if block.t == 'Para' then
      if i > 1 then
        inlines:insert(pandoc.LineBreak())
      end
      inlines:extend(block.content)
    end
  end
  return inlines
end

--- Format a BlockQuote as an epigraph if it matches the pattern.
--- @param el pandoc.BlockQuote The blockquote to process
--- @return pandoc.Block|pandoc.List|nil Formatted epigraph or nil for pass-through
local function BlockQuote(el)
  local blocks = el.content

  -- Need at least 2 blocks (quote text + attribution) or 1 block with attribution
  if #blocks < 1 then
    return nil
  end

  -- Check if the last block is an attribution paragraph
  local last_block = blocks[#blocks]
  if not is_attribution(last_block) then
    return nil -- Not an epigraph, pass through unchanged
  end

  -- Extract quote and attribution
  local attribution = extract_attribution(last_block)
  local quote_blocks = {}
  for i = 1, #blocks - 1 do
    table.insert(quote_blocks, blocks[i])
  end
  local quote_inlines = extract_quote_inlines(quote_blocks)

  if FORMAT:match 'docx' then
    -- DOCX: Para elements with custom-style for epigraph text and attribution
    local result = pandoc.List()

    -- Quote text paragraphs with Epigraph style
    for _, block in ipairs(quote_blocks) do
      if block.t == 'Para' then
        local div = pandoc.Div({block}, pandoc.Attr('', {}, {{'custom-style', 'Epigraph'}}))
        result:insert(div)
      end
    end

    -- Attribution paragraph with Epigraph Attribution style
    local attr_para = pandoc.Para({pandoc.Str(attribution)})
    local attr_div = pandoc.Div({attr_para}, pandoc.Attr('', {}, {{'custom-style', 'Epigraph Attribution'}}))
    result:insert(attr_div)

    return result

  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    -- EPUB/HTML: Semantic blockquote with cite element
    local quote_html = ''
    for _, block in ipairs(quote_blocks) do
      if block.t == 'Para' then
        local text = pandoc.utils.stringify(block)
        quote_html = quote_html .. '<p>' .. text .. '</p>\n'
      end
    end
    local html = '<blockquote class="epigraph">\n'
      .. quote_html
      .. '<cite>' .. attribution .. '</cite>\n'
      .. '</blockquote>'
    return pandoc.RawBlock('html', html)

  elseif FORMAT:match 'typst' then
    -- Typst: Styled block with indentation, italic text, and right-aligned attribution
    local quote_text = pandoc.utils.stringify(pandoc.Pandoc(quote_blocks))
    local typst_code = '#block(inset: (left: 2em, right: 2em))[\n'
      .. '#emph[' .. quote_text .. ']\n'
      .. '#align(right)[--- ' .. attribution .. ']\n'
      .. ']'
    return pandoc.RawBlock('typst', typst_code)

  elseif FORMAT:match 'latex' then
    -- LaTeX: Epigraph environment or manual formatting
    local quote_text = pandoc.utils.stringify(pandoc.Pandoc(quote_blocks))
    local latex_code = '\\begin{quote}\n'
      .. '\\itshape ' .. quote_text .. '\n'
      .. '\\hfill --- ' .. attribution .. '\n'
      .. '\\end{quote}'
    return pandoc.RawBlock('latex', latex_code)

  else
    return nil
  end
end

return {{BlockQuote = BlockQuote}}
