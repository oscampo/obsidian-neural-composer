import { useState } from 'react' // <--- Importante: useState
import {
  AssistantToolMessageGroup,
  ChatMessage,
  ChatToolMessage,
} from '../../types/chat'

import AssistantMessageAnnotations from './AssistantMessageAnnotations'
import AssistantMessageContent from './AssistantMessageContent'
import AssistantMessageReasoning from './AssistantMessageReasoning'
import AssistantToolMessageGroupActions from './AssistantToolMessageGroupActions'
import ToolMessage from './ToolMessage'

export type AssistantToolMessageGroupItemProps = {
  messages: AssistantToolMessageGroup
  contextMessages: ChatMessage[]
  conversationId: string
  isApplying: boolean
  onApply: (blockToApply: string, chatMessages: ChatMessage[]) => void
  onToolMessageUpdate: (message: ChatToolMessage) => void
  onAssistantMessageUpdate: (messageId: string, newContent: string) => void
}

export default function AssistantToolMessageGroupItem({
  messages,
  contextMessages,
  conversationId,
  isApplying,
  onApply,
  onToolMessageUpdate,
  onAssistantMessageUpdate,
}: AssistantToolMessageGroupItemProps) {
  
  // --- CORA MOD: ESTADO DE EDICIÓN LOCAL ---
  const [isEditing, setIsEditing] = useState(false)

  // Función para guardar y cerrar edición
  const handleContentUpdate = (messageId: string, newContent: string) => {
    onAssistantMessageUpdate(messageId, newContent)
    setIsEditing(false) // Cerrar al guardar
  }
  // -----------------------------------------

  return (
    <div className="smtcmp-assistant-tool-message-group">
      {messages.map((message) =>
        message.role === 'assistant' ? (
          message.reasoning || message.annotations || message.content ? (
            <div key={message.id} className="smtcmp-chat-messages-assistant">
              {message.reasoning && (
                <AssistantMessageReasoning reasoning={message.reasoning} />
              )}
              {message.annotations && (
                <AssistantMessageAnnotations
                  annotations={message.annotations}
                />
              )}
              <AssistantMessageContent
                content={message.content}
                contextMessages={contextMessages}
                handleApply={onApply}
                isApplying={isApplying}
                // --- CORA MOD: Conectamos ---
                onContentUpdate={(newContent) => handleContentUpdate(message.id, newContent)}
                isEditingMode={isEditing} // Le decimos al hijo si debe mostrar el textarea
                onCancelEdit={() => setIsEditing(false)} // Para el botón cancelar
              />
            </div>
          ) : null
        ) : (
          <div key={message.id}>
            <ToolMessage
              message={message}
              conversationId={conversationId}
              onMessageUpdate={onToolMessageUpdate}
            />
          </div>
        ),
      )}
      {messages.length > 0 && (
        <AssistantToolMessageGroupActions 
            messages={messages} 
            // --- CORA MOD: Conectar el botón ---
            onToggleEdit={() => setIsEditing(!isEditing)}
            isEditing={isEditing}
        />
      )}
    </div>
  )
}