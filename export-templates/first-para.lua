--- first-para.lua
--- Pandoc Lua filter: Removes first-line indent from the first paragraph
--- following any Header element or scene break marker.
---
--- This filter runs SECOND in the chain (after scene-break.lua), so it sees
--- the transformed output of scene breaks -- not raw HorizontalRule elements.
--- It detects scene breaks by recognizing:
---   - DOCX: Para containing a Span with custom-style 'Scene Break'
---   - EPUB/HTML: RawBlock containing class="scene-break"
---   - Typst: RawBlock containing '#align(center)' (scene break pattern)
---
--- Filter order in pipeline: 2nd (runs after scene-break.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

--- Check if a block is a scene break marker (output of scene-break.lua).
--- @param block pandoc.Block The block to check
--- @return boolean True if block is a transformed scene break
local function is_scene_break(block)
  -- DOCX: Para with a Span that has custom-style 'Scene Break'
  if block.t == 'Para' then
    for _, inline in ipairs(block.content) do
      if inline.t == 'Span' then
        local style = inline.attr.attributes['custom-style']
        if style == 'Scene Break' then
          return true
        end
      end
    end
  end

  -- EPUB/HTML or Typst: RawBlock containing scene break indicators
  if block.t == 'RawBlock' then
    if block.text:match('class="scene%-break"') then
      return true
    end
    if block.text:match('#align%(center%)') then
      return true
    end
  end

  return false
end

--- Apply first-paragraph styling to a Para block.
--- @param para pandoc.Para The paragraph to style
--- @return pandoc.Block The styled paragraph (format-specific)
local function apply_first_para(para)
  if FORMAT:match 'docx' then
    -- DOCX: Wrap all inline content in a Div with custom-style 'First Paragraph'
    -- (reference doc defines this style without first-line indent)
    local div = pandoc.Div({para}, pandoc.Attr('', {}, {{'custom-style', 'First Paragraph'}}))
    return div

  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    -- EPUB/HTML: Wrap paragraph content in <p class="first-paragraph">
    local html_open = '<p class="first-paragraph">'
    local html_close = '</p>'
    local content = pandoc.write(pandoc.Pandoc({para}), 'html')
    -- Strip the outer <p> tag that Pandoc generates and replace with our classed version
    content = content:gsub('^%s*<p>', html_open):gsub('</p>%s*$', html_close)
    return pandoc.RawBlock('html', content)

  elseif FORMAT:match 'typst' then
    -- Typst: Prepend a set rule to remove first-line indent for this paragraph
    local set_rule = pandoc.RawBlock('typst', '#set par(first-line-indent: 0pt)')
    return {set_rule, para}

  else
    return para
  end
end

--- Walk the block list and mark paragraphs that follow Headers or scene breaks.
--- Uses a Blocks filter to process the full block list with positional awareness.
local function Blocks(blocks)
  local result = pandoc.List()
  local mark_next_para = false

  for _, block in ipairs(blocks) do
    -- Check if this block is a trigger (Header or scene break)
    if block.t == 'Header' then
      mark_next_para = true
      result:insert(block)
    elseif is_scene_break(block) then
      mark_next_para = true
      result:insert(block)
    elseif mark_next_para and block.t == 'Para' then
      -- This is the first paragraph after a trigger -- apply styling
      local styled = apply_first_para(block)
      if type(styled) == 'table' and not styled.t then
        -- apply_first_para returned a list of blocks (Typst case)
        for _, b in ipairs(styled) do
          result:insert(b)
        end
      else
        result:insert(styled)
      end
      mark_next_para = false
    else
      -- Not a trigger and not a marked para -- reset flag for non-Para blocks
      if block.t ~= 'Para' then
        -- Non-paragraph block between trigger and first para: keep marking
        -- (e.g., a RawBlock injected by another filter)
      else
        mark_next_para = false
      end
      result:insert(block)
    end
  end

  return result
end

return {{Blocks = Blocks}}
