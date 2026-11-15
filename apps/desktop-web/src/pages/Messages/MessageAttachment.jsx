import { useState } from 'react';
import { Download, Eye, Reply, Share2 } from 'lucide-react';
import SmallPopup from '../../components/ui/SmallPopup';
import { chatAttachmentPath } from '../../services/message.service';
import { AttachmentDetails, AttachmentPreview } from './AttachmentPreview';

export default function MessageAttachment({ conversationId, message, onReply, onShare }) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const asset = message.media;
  const path = chatAttachmentPath(conversationId, message._id, asset?.assetId);
  if (!path) return null;
  const url = '/api/v1' + path;
  const name = asset.fileName || 'Attachment';
  const image = message.type === 'image' && !imageFailed;
  return <div className="chat-attachment">
    <button className="chat-attachment-card" type="button" aria-haspopup="dialog"
      aria-label={`Attachment options for ${name}`} onClick={() => setOpen(true)}>
      {image && <img src={url} alt="" loading="lazy" onError={() => setImageFailed(true)} />}
      <span className="chat-attachment-rail">
        {image ? <span>Photo</span> : <AttachmentDetails name={name} size={asset.fileSize} />}
        <Eye size={16} aria-hidden="true" />
      </span>
    </button>
    <SmallPopup isOpen={open} title="Attachment preview" className="chat-attachment-popup"
      onClose={() => setOpen(false)}
      actions={<>
        <button type="button" className="chat-attachment-action" onClick={() => setOpen(false)}>Close</button>
        <button type="button" className="chat-attachment-action" onClick={() => {
          setOpen(false);
          requestAnimationFrame(onReply);
        }}><Reply size={15} /> Reply</button>
        <button type="button" className="chat-attachment-action" onClick={() => {
          setOpen(false);
          requestAnimationFrame(onShare);
        }}><Share2 size={15} /> Share</button>
        <a className="chat-attachment-action" href={url} download={name}><Download size={15} /> Download</a>
      </>}>
      {open && <AttachmentPreview kind={message.type} name={name} size={asset.fileSize} source={url} />}
    </SmallPopup>
  </div>;
}
