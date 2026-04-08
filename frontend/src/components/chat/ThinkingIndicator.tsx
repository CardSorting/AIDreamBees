// UI: Presentation component - animated thinking state
// ============================================================================

import { motion } from 'framer-motion';
import {
  Bug as Bee,
} from 'lucide-react';

interface ThinkingIndicatorProps {
  isActive: boolean;
}

export default function ThinkingIndicator({ isActive }: ThinkingIndicatorProps) {
  if (!isActive) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="message-row bot"
    >
      <div className="thinking-resonance">
        <div className="resonance-waves">
          <div className="wave" />
          <div className="wave delay-1" />
          <div className="wave delay-2" />
        </div>
        <span>Thinking...</span>
      </div>
    </motion.div>
  );
}