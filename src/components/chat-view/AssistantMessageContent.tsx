import { Check } from 'lucide-react'
import React, { useCallback, useMemo, useState, useEffect } from 'react'

import { ChatAssistantMessage, ChatMessage } from '../../types/chat'
import {
  ParsedTagContent,
  parseTagContents,
} from '../../utils/chat/parse-tag-content'

import AssistantMessageReasoning from './AssistantMessageReasoning'
import MarkdownCodeComponent from './MarkdownCodeComponent'
import MarkdownReferenceBlock from './MarkdownReferenceBlock'
import { ObsidianMarkdown } from './ObsidianMarkdown'

export default function AssistantMessageContent({
  content,
  contextMessages,
  handleApply,
  isApplying,
  onContentUpdate,
  // --- CORA MOD: Props nuevas ---
  isEditingMode = false,
  onCancelEdit,
}: {
  content: ChatAssistantMessage['content']
  contextMessages: ChatMessage[]
  handleApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  isApplying: boolean
  onContentUpdate?: (newContent: string) => void
  isEditingMode?: boolean
  onCancelEdit?: () => void
}) {
  const [editedContent, setEditedContent] = useState(content)

  // Sincronizar
  useEffect(() => {
    setEditedContent(content)
  }, [content])

  const onApply = useCallback(
    (blockToApply: string) => {
      handleApply(blockToApply, contextMessages)
    },
    [handleApply, contextMessages],
  )

  // --- MODO EDICIÓN ACTIVADO POR EL PADRE ---
  if (isEditingMode && onContentUpdate) {
    return (
      <div className="smtcmp-edit-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          style={{
            width: '100%',
            minHeight: '150px',
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid var(--interactive-accent)',
            backgroundColor: 'var(--background-primary)',
            color: 'var(--text-normal)',
            fontFamily: 'var(--font-monospace)',
            resize: 'vertical',
            fontSize: '0.9em'
          }}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={() => { setEditedContent(content); if(onCancelEdit) onCancelEdit(); }}>
             Cancel
          </button>
          <button className="mod-cta" onClick={() => onContentUpdate(editedContent)}>
             <Check size={14} style={{marginRight: '4px'}}/> Save
          </button>
        </div>
      </div>
    )
  }

  // --- MODO LECTURA ---
  return (
    <AssistantTextRenderer onApply={onApply} isApplying={isApplying}>
      {content}
    </AssistantTextRenderer>
  )
}

const AssistantTextRenderer = React.memo(function AssistantTextRenderer({
  onApply,
  isApplying,
  children,
}: {
  onApply: (blockToApply: string) => void
  children: string
  isApplying: boolean
}) {
  const blocks: ParsedTagContent[] = useMemo(
    () => parseTagContents(children),
    [children],
  )

  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'string' ? (
          <div key={index}>
            <ObsidianMarkdown content={block.content} scale="sm" />
          </div>
        ) : block.type === 'think' ? (
          <AssistantMessageReasoning key={index} reasoning={block.content} />
        ) : block.startLine && block.endLine && block.filename ? (
          <MarkdownReferenceBlock
            key={index}
            filename={block.filename}
            startLine={block.startLine}
            endLine={block.endLine}
          />
        ) : (
          <MarkdownCodeComponent
            key={index}
            onApply={onApply}
            isApplying={isApplying}
            language={block.language}
            filename={block.filename}
          >
            {block.content}
          </MarkdownCodeComponent>
        ),
      )}
    </>
  )
})