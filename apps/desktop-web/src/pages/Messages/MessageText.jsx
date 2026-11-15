const linkPattern = /((?:https?:\/\/|localhost:\d+|127\.0\.0\.1:\d+)[^\s<>]*)/gi;

export default function MessageText({ text = '' }) {
  return (text || '').split(linkPattern).map((part, index) => {
    if (index % 2 === 0) return part;
    const label = part.replace(/[.,!?;:'")\]}]+$/, '');
    let href;
    try {
      const url = new URL(/^https?:\/\//i.test(label) ? label : 'http://' + label);
      if (url.username || url.password) return part;
      href = url.href;
    } catch {
      return part;
    }
    return <span key={index}>
      <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
      {part.slice(label.length)}
    </span>;
  });
}
