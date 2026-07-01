import { MessageSquare } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ChatHistorySidebar } from '../components/chatbot/ChatHistorySidebar';
import { ChatWindow } from '../components/chatbot/ChatWindow';
import { useRagChat } from '../hooks/useRagChat';

export function ChatbotPage() {
  // Always query every pool; the 'all' scope is the same backend path as a single
  // filter, so dropping the buttons costs no query speed.
  const {
    messages,
    isLoading,
    error,
    conversations,
    activeId,
    sendMessage,
    stop,
    newChat,
    selectChat,
    deleteChat,
  } = useRagChat('all');

  // Auto-send a prompt seeded from the home chat bar (navigate state), once.
  const location = useLocation();
  const navigate = useNavigate();
  const seeded = useRef(false);
  useEffect(() => {
    const prompt = location.state?.prompt;
    if (!prompt || seeded.current) return;
    seeded.current = true;
    sendMessage(prompt);
    navigate(location.pathname, { replace: true }); // clear state so refresh won't resend
  }, [location, navigate, sendMessage]);

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10 text-bloomberg-white">
      <main className="flex flex-col h-[calc(100vh-60px)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-bloomberg-border bg-bloomberg-surface">
          <MessageSquare size={20} className="text-bloomberg-orange" />
          <h1 className="text-bloomberg-white font-semibold text-base">Chatbot</h1>
        </div>

        {/* History rail + chat */}
        <div className="flex flex-1 overflow-hidden">
          <ChatHistorySidebar
            conversations={conversations}
            activeId={activeId}
            onNew={newChat}
            onSelect={selectChat}
            onDelete={deleteChat}
          />
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              <ChatWindow
                messages={messages}
                isLoading={isLoading}
                error={error}
                onSend={sendMessage}
                onStop={stop}
              />
            </div>
            {/* Disclaimer */}
            <div className="px-6 py-2 border-t border-bloomberg-border bg-bloomberg-surface">
              <p className="text-[10px] text-bloomberg-muted text-center">
                This chatbot only reads data already in the app. Not financial advice.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
