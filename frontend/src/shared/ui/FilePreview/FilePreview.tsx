import s from './FilePreview.module.css';

export function FilePreview(props: { text: string } | { url: string; type: string; title: string }) {
  if ('text' in props) return <pre className={s.text}>{props.text}</pre>;
  if (props.type.startsWith('image/')) return <img src={props.url} alt={props.title} className={s.image} />;
  return <iframe src={props.url} title={props.title} className={s.frame} />;
}
