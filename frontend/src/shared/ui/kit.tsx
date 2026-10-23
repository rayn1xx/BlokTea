import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ComponentType, MouseEventHandler, ReactNode, SVGProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@alfalab/core-components/button';
import { ArrowLeftMIcon } from '@alfalab/icons-glyph/ArrowLeftMIcon';
import { ArrowRightMIcon } from '@alfalab/icons-glyph/ArrowRightMIcon';
import { CheckmarkMIcon } from '@alfalab/icons-glyph/CheckmarkMIcon';
import { ChevronDownMIcon } from '@alfalab/icons-glyph/ChevronDownMIcon';
import { InformationCircleLineMIcon } from '@alfalab/icons-glyph/InformationCircleLineMIcon';
import { MagnifierMIcon } from '@alfalab/icons-glyph/MagnifierMIcon';

import { cx } from './layout';

import k from './kit.module.css';

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type BtnVariant = 'primary' | 'outlineRed' | 'outline' | 'soft' | 'ghost';

export function Btn({
  variant = 'primary',
  size = 'm',
  block,
  loading,
  disabled,
  onClick,
  children,
  type = 'button',
  leftAddons,
  rightAddons,
  className,
}: {
  variant?: BtnVariant;
  size?: 's' | 'm' | 'l';
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  type?: 'button' | 'submit';
  leftAddons?: ReactNode;
  rightAddons?: ReactNode;
  className?: string;
}) {
  const view = variant === 'primary' ? 'accent' : variant === 'ghost' ? 'transparent' : variant === 'soft' ? 'secondary' : 'outlined';
  return (
    <Button
      view={view}
      size={size === 's' ? 32 : size === 'm' ? 40 : 48}
      block={block}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      type={type}
      leftAddons={leftAddons}
      rightAddons={rightAddons}
      className={cx(k.btn, k[variant], className)}
    >
      {children}
    </Button>
  );
}

export function TextLink({
  children,
  to,
  onClick,
  tone = 'default',
  arrow,
  underline,
  disabled,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: 'default' | 'red' | 'blue' | 'muted';
  arrow?: boolean;
  underline?: boolean;
  disabled?: boolean;
}) {
  const cls = cx(k.link, tone === 'red' && k.linkRed, tone === 'blue' && k.linkBlue, tone === 'muted' && k.linkMuted, underline && k.linkUnderline);
  const content = (
    <>
      {children}
      {arrow && <ArrowRightMIcon className={k.linkIcon} />}
    </>
  );
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type='button' className={cls} onClick={onClick} disabled={disabled} style={disabled ? { opacity: 0.5, cursor: 'default' } : undefined}>
      {content}
    </button>
  );
}

export type PillTone = 'grey' | 'green' | 'yellow' | 'red' | 'blue' | 'white' | 'purple';

export function Pill({ tone = 'grey', children, small, caps, icon }: { tone?: PillTone; children: ReactNode; small?: boolean; caps?: boolean; icon?: ReactNode }) {
  return (
    <span className={cx(k.pill, k[tone], small && k.pillSmall, caps && k.pillCaps)}>
      {icon}
      {children}
    </span>
  );
}

export function PageHead({
  back,
  title,
  badge,
  subtitle,
  right,
}: {
  back?: { label: string; to: string };
  title: ReactNode;
  badge?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div>
      {back && (
        <button type='button' className={k.back} onClick={() => navigate(back.to)}>
          <ArrowLeftMIcon />
          {back.label}
        </button>
      )}
      <div className={k.pageHead}>
        <div style={{ minWidth: 0 }}>
          <h1 className={k.pageTitle}>
            {title}
            {badge}
          </h1>
          {subtitle && <p className={k.pageSubtitle}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

export function Box({
  title,
  right,
  children,
  tight,
  className,
  style,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  tight?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cx(k.box, tight && k.boxTight, className)} style={style}>
      {(title || right) && (
        <div className={k.boxHead}>
          {typeof title === 'string' ? <h2 className={k.boxTitle}>{title}</h2> : title}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({
  tone = 'grey',
  children,
  className,
  style,
}: {
  tone?: 'grey' | 'green' | 'yellow' | 'red' | 'blue' | 'white';
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const map = { grey: k.panelGrey, green: k.panelGreen, yellow: k.panelYellow, red: k.panelRed, blue: k.panelBlue, white: k.panelWhite };
  return (
    <div className={cx(k.panel, map[tone], className)} style={style}>
      {children}
    </div>
  );
}

export function Metrics({ items, small }: { items: { value: ReactNode; label: ReactNode; hint?: ReactNode }[]; small?: boolean }) {
  return (
    <div className={cx(k.metrics, small && k.metricsSmall)}>
      {items.map((m, i) => (
        <div key={i} className={k.metric}>
          <div className={k.metricValue}>{m.value}</div>
          <div className={k.metricLabel}>{m.label}</div>
          {m.hint && <div className={k.metricHint}>{m.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: ReactNode; count?: number; to?: string }[];
  value: T;
  onChange?: (id: T) => void;
}) {
  return (
    <nav className={k.tabs} role='tablist'>
      {items.map((t) => {
        const content = (
          <>
            {t.label}
            {t.count !== undefined && <span className={k.tabCount}> · {t.count}</span>}
          </>
        );
        const cls = cx(k.tab, t.id === value && k.tabActive);
        return t.to ? (
          <Link key={t.id} to={t.to} className={cls} role='tab' aria-selected={t.id === value}>
            {content}
          </Link>
        ) : (
          <button key={t.id} type='button' className={cls} role='tab' aria-selected={t.id === value} onClick={() => onChange?.(t.id)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}

export function Accordion({
  icon: IconCmp,
  title,
  subtitle,
  right,
  children,
  defaultOpen,
  onClick,
  arrow,
}: {
  icon?: Icon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  onClick?: () => void;
  arrow?: 'down' | 'right' | 'none';
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const expandable = !!children;
  const handle = () => (onClick ? onClick() : expandable && setOpen((v) => !v));
  const chevron = arrow ?? (expandable ? 'down' : onClick ? 'right' : 'none');
  return (
    <div className={k.accordion}>
      <div
        role='button'
        tabIndex={0}
        className={k.accordionHead}
        onClick={handle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            handle();
          }
        }}
        aria-expanded={expandable ? open : undefined}
      >
        {IconCmp && (
          <span className={k.accordionIcon}>
            <IconCmp />
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className={k.accordionTitle} style={{ display: 'block' }}>
            {title}
          </span>
          {subtitle && (
            <span className={k.accordionSub} style={{ display: 'block' }}>
              {subtitle}
            </span>
          )}
        </span>
        {right}
        {chevron === 'down' && <ChevronDownMIcon className={cx(k.chevron, open && k.chevronOpen)} />}
        {chevron === 'right' && <ChevronDownMIcon className={k.chevron} style={{ transform: 'rotate(-90deg)' }} />}
      </div>
      {expandable && open && <div className={k.accordionBody}>{children}</div>}
    </div>
  );
}

export function Options<T extends string>({
  options,
  value,
  values,
  onChange,
  columns = 3,
  radio,
  disabled,
}: {
  options: { value: T; label: ReactNode; description?: ReactNode }[];
  value?: T | null | undefined;
  values?: T[];
  onChange: (v: T) => void;
  columns?: number;
  radio?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={k.options} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role='radiogroup'>
      {options.map((o) => (
        <button
          key={o.value}
          type='button'
          role='radio'
          aria-checked={(values ? values.includes(o.value) : value === o.value)}
          disabled={disabled}
          className={cx(k.option, (values ? values.includes(o.value) : value === o.value) && k.optionActive, !radio && k.optionCenter)}
          onClick={() => onChange(o.value)}
        >
          {radio && <span className={k.optionRadio} />}
          <span className={radio ? k.optionText : undefined}>
            {o.label}
            {o.description && <span className={k.optionDesc}>{o.description}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, tone = 'red' }: { value: number; tone?: 'red' | 'green' }) {
  return (
    <div className={k.bar} role='progressbar' aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx(k.barFill, tone === 'green' && k.barGreen)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function StepsBar({ total, done }: { total: number; done: number }) {
  return (
    <div className={k.steps}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cx(k.stepsItem, i < done && k.stepsItemDone)} />
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  ['#e7eefc', '#3b5bb5'],
  ['#fdeaea', '#b2373b'],
  ['#e5f4ec', '#2f7a4f'],
  ['#fdeedd', '#9a5b1a'],
  ['#efe9fb', '#6b46c1'],
];

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const idx = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length;
  const [bg, color] = AVATAR_TONES[idx];
  return (
    <span className={cx(k.avatar, large && k.avatarLarge)} style={{ background: bg, color }}>
      {letters}
    </span>
  );
}

export function IconCircle({ icon: IconCmp, style }: { icon: Icon; style?: CSSProperties }) {
  return (
    <span className={k.iconCircle} style={style}>
      <IconCmp />
    </span>
  );
}

export function InfoLine({ children, style, icon: IconCmp = InformationCircleLineMIcon }: { children: ReactNode; style?: CSSProperties; icon?: Icon }) {
  return (
    <div className={k.infoLine} style={style}>
      <IconCmp />
      <span>{children}</span>
    </div>
  );
}

export function InfoStrip({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={k.infoStrip}>
      <InformationCircleLineMIcon />
      <span style={{ flex: 1 }}>{children}</span>
      {right}
    </div>
  );
}

export function Field({
  label,
  optional,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  optional?: string | boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      {label && (
        <div className={k.label}>
          {label}
          {optional && <span className={k.labelOptional}>{optional === true ? 'Необязательно' : optional}</span>}
        </div>
      )}
      {children}
      {error ? <div className={k.fieldError}>{error}</div> : hint ? <div className={k.hint}>{hint}</div> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: T | '' | null | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select className={k.select} value={value ?? ''} onChange={(e) => onChange(e.target.value as T)} disabled={disabled} aria-label={ariaLabel}>
      {placeholder !== undefined && (
        <option value='' disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  suffix,
  error,
  type = 'text',
  inputMode,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: ReactNode;
  error?: boolean;
  type?: string;
  inputMode?: 'numeric' | 'email' | 'text';
  ariaLabel?: string;
}) {
  return (
    <div className={k.inputWrap}>
      <input
        className={cx(k.textInput, error && k.textInputError)}
        value={value}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={suffix ? { paddingRight: 44 } : undefined}
      />
      {suffix && <span className={k.inputSuffix}>{suffix}</span>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={k.search}>
      <MagnifierMIcon />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className={k.textarea} value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function CheckField({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={k.check} style={disabled ? { opacity: 0.6, cursor: 'default' } : undefined}>
      <input type='checkbox' checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(k.toggle, checked && k.toggleOn)}
      onClick={() => onChange(!checked)}
    />
  );
}

export function DashedArea({ icon: IconCmp, title, text }: { icon: Icon; title: ReactNode; text?: ReactNode }) {
  return (
    <div className={k.dash}>
      <IconCmp />
      <div style={{ fontWeight: 500, color: 'var(--a-text)' }}>{title}</div>
      {text && <div style={{ fontSize: 14 }}>{text}</div>}
    </div>
  );
}

export function ModalFooter({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className={k.modalFooter}>
      <span className={k.modalFooterNote}>{note}</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export function DotsMenu({ items }: { items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Btn variant='outline' size='m' onClick={() => setOpen((v) => !v)}>
        <span aria-label='Ещё действия'>···</span>
      </Btn>
      {open && (
        <div className={k.menu} style={{ right: 0, top: 46 }} role='menu'>
          {items.map((i) => (
            <button
              key={i.label}
              type='button'
              role='menuitem'
              className={cx(k.menuItem, i.danger && k.menuItemDanger)}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type TimelineStage = { key: string; title: string; time?: string | null; state: 'done' | 'current' | 'future' | 'negative' };

export function StageLine({ stages }: { stages: TimelineStage[] }) {
  return (
    <ol className={k.timeline}>
      {stages.map((s) => (
        <li
          key={s.key}
          className={cx(k.tlStep, s.state === 'done' && k.tlDone, s.state === 'current' && k.tlCurrent, s.state === 'negative' && k.tlNegative)}
          aria-current={s.state === 'current' ? 'step' : undefined}
        >
          <span className={k.tlMarker}>{s.state === 'done' && <CheckmarkMIcon />}</span>
          <div>
            <div className={k.tlTitle} style={{ fontWeight: s.state === 'current' ? 600 : 400 }}>
              {s.title}
            </div>
            {s.time && <div className={k.tlTime}>{s.time}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export { k as kit };
