// UI: Presentation component - image grid display
// ============================================================================

import { ExternalLink } from 'lucide-react';
import type { Message } from '../../domain/messages/types';

interface ImageGridProps {
  images: string[];
  sourceImages?: string[];
  messageId: string;
}

export default function ImageGrid({
  images,
  sourceImages,
  messageId,
}: ImageGridProps) {
  return (
    <div className="image-grid-refined">
      {images && images.length > 0 ? (
        images.map((img, idx) => (
          <div key={`${messageId}-img-${img.substring(0, 32)}`} className="image-frame">
            <button
              type="button"
              className="image-btn-wrapper"
              onClick={() => openImage(img)}
            >
              <img
                src={img}
                alt={`Cognitive Synthesis ${idx + 1}`}
              />
            </button>
            {sourceImages && sourceImages.length > 1 && (
              <div className="image-meta-overlay">
                <span className="multiplex-tag">COMB #{idx + 1}</span>
                <button
                  type="button"
                  className="expand-btn"
                  onClick={() => openImage(img)}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            )}
          </div>
        ))
      ) : null}
    </div>
  );
}

function openImage(imageData: string): void {
  if (imageData.startsWith('data:')) {
    window.open(imageData, '_blank');
  } else {
    window.open(`data:image/png;base64,${imageData}`, '_blank');
  }
}