
export const stripMarkdown = (text: string | undefined): string => {
  if (!text) {
    return "";
  }
  return text.replace(/\*\*/g, "").trim();
};
