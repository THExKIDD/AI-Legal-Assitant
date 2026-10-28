import React from "react";

function formatInlineMarkdown(text) {
  if (!text) return "";

  // Split by bold (**bold**)
  const boldParts = text.split(/(\*\*.*?\*\*)/g);

  return boldParts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="legal-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Split remaining by italic (*italic*)
    const italicParts = part.split(/(\*.*?\*)/g);
    return italicParts.map((sub, j) => {
      if (sub.startsWith("*") && sub.endsWith("*") && sub.length >= 2) {
        return (
          <em key={j} className="legal-italic">
            {sub.slice(1, -1)}
          </em>
        );
      }
      return sub;
    });
  });
}

export function LegalMessageContent({
  answer = "",
  messageId = "",
  isExpanded = false,
  onToggleExpand
}) {
  if (!answer) return null;

  // Split lines
  const lines = answer.split("\n");
  const renderedElements = [];

  lines.forEach((rawLine, index) => {
    let line = rawLine.trim();

    if (!line) {
      return;
    }

    // Disclaimer line detection
    const isDisclaimer =
      line.toLowerCase().includes("not a substitute for advice from a qualified lawyer") ||
      line.toLowerCase().includes("not a substitute for legal advice") ||
      line.toLowerCase().startsWith("this is general legal information");

    if (isDisclaimer) {
      renderedElements.push(
        <div key={`disc-${index}`} className="legal-disclaimer-pill">
          <span className="disclaimer-icon">⚖</span>
          <span className="disclaimer-text">{line}</span>
        </div>
      );
      return;
    }

    // Filter out any source file names or document references
    if (
      line.toLowerCase().startsWith("source:") ||
      line.toLowerCase().startsWith("sources:") ||
      line.toLowerCase().startsWith("source file:") ||
      line.toLowerCase().includes("project document:") ||
      line.toLowerCase().includes("source: project document")
    ) {
      return;
    }

    // Ignore pro tip callout lines or tip prompts
    if (
      line.startsWith("💡") ||
      line.toLowerCase().includes("want a complete") ||
      line.toLowerCase().includes("ask \"explain in detail\"") ||
      line.toLowerCase().includes("click the explain in detail")
    ) {
      return;
    }

    // Heading lines: ### or ## or #
    if (line.startsWith("###") || line.startsWith("##") || line.startsWith("#")) {
      const cleanHeading = line.replace(/^#+\s*/, "").replace(/^[📌📖📋⚖️📁⚠️]+\s*/, "");
      renderedElements.push(
        <h4 key={`head-${index}`} className="legal-section-heading">
          {cleanHeading}
        </h4>
      );
      return;
    }

    // If a line starts with a bullet symbol or number, strip it clean so it reads as natural text without bullets
    line = line.replace(/^[\•\-\*\+]\s+/, "");
    line = line.replace(/^\d+[\.\)]\s+/, "");

    // Render as clean paragraph
    renderedElements.push(
      <p key={`p-${index}`} className="legal-paragraph">
        {formatInlineMarkdown(line)}
      </p>
    );
  });

  // Determine if content is long enough to warrant Read More toggle
  const isLongContent = answer.length > 340 || lines.length > 7;

  return (
    <div className="legal-answer-wrapper">
      <div
        className={`legal-answer-body ${
          isLongContent && !isExpanded ? "collapsed" : "expanded"
        }`}
      >
        {renderedElements}

        {isLongContent && !isExpanded && (
          <div className="read-more-gradient-overlay" />
        )}
      </div>

      {isLongContent && (
        <div className="read-more-controls">
          <button
            className="read-more-btn"
            onClick={() => onToggleExpand && onToggleExpand(messageId)}
            type="button"
          >
            <span>{isExpanded ? "▲ Read Less" : "▼ Read More"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default LegalMessageContent;
