import { MessageSquare } from 'lucide-react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import { CHATBOT_PATH } from '../../../../constants/routes';

// Rendered only inside a router (see OverviewSection).
export function AskChatbotButton({ prompt, className }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(CHATBOT_PATH, { state: { prompt } })}
      className={className}
    >
      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
      Ask Chatbot
    </button>
  );
}

AskChatbotButton.propTypes = {
  prompt: PropTypes.string.isRequired,
  className: PropTypes.string,
};
