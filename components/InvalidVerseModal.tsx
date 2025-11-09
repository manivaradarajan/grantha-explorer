import { Modal, Button } from "antd";
import React from "react";

interface InvalidVerseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string; // Custom title for the modal
  messageLines: string[]; // Array of strings for multi-line message
}

const InvalidVerseModal: React.FC<InvalidVerseModalProps> = ({
  isOpen,
  onClose,
  title,
  messageLines,
}) => {
  return (
    <Modal
      title={<div className="text-center w-full">{title}</div>} // Center the title
      open={isOpen}
      onCancel={onClose}
      width={300} // Make the modal even less wide
      closable={false} // Remove the close icon (X)
      footer={[
        <div key="footer" className="flex justify-center w-full">
          <Button type="primary" onClick={onClose}>
            अस्तु
          </Button>
        </div>,
      ]}
      centered
      getContainer={false} // Render modal in its current DOM position
    >
      {messageLines.map((line, index) => (
        <p key={index} className="text-center">
          {line}
        </p>
      ))}
    </Modal>
  );
};

export default InvalidVerseModal;
