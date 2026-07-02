import { Driver } from '@/data/mock';
import { cn } from '@/lib/utils';

type AvatarStyle = {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  accent: string;
  ring: string;
  variant: 'short' | 'side' | 'bob' | 'beard' | 'long';
};

const styles: Record<string, AvatarStyle> = {
  emerald: {
    bg: '#dcfce7',
    skin: '#d8a06f',
    hair: '#1f2937',
    shirt: '#059669',
    accent: '#bbf7d0',
    ring: 'bg-emerald-500',
    variant: 'short',
  },
  sky: {
    bg: '#e0f2fe',
    skin: '#c9875b',
    hair: '#111827',
    shirt: '#0284c7',
    accent: '#bae6fd',
    ring: 'bg-sky-500',
    variant: 'side',
  },
  rose: {
    bg: '#ffe4e6',
    skin: '#e0a777',
    hair: '#3f2a22',
    shirt: '#e11d48',
    accent: '#fecdd3',
    ring: 'bg-rose-500',
    variant: 'bob',
  },
  amber: {
    bg: '#fef3c7',
    skin: '#b8754f',
    hair: '#2b201c',
    shirt: '#d97706',
    accent: '#fde68a',
    ring: 'bg-amber-500',
    variant: 'beard',
  },
  violet: {
    bg: '#ede9fe',
    skin: '#d89b72',
    hair: '#1f1a2e',
    shirt: '#7c3aed',
    accent: '#ddd6fe',
    ring: 'bg-violet-500',
    variant: 'long',
  },
};

function Hair({ style }: { style: AvatarStyle }) {
  if (style.variant === 'bob') {
    return (
      <>
        <path d="M23 26c0-10 8-17 17-17s17 7 17 17v17H23V26Z" fill={style.hair} />
        <path
          d="M27 28c3-8 9-12 17-12 6 0 11 3 14 8-8-1-18-4-25-9-4 3-6 7-6 13Z"
          fill="#ffffff"
          opacity=".12"
        />
      </>
    );
  }

  if (style.variant === 'beard') {
    return (
      <>
        <path
          d="M24 30c1-13 9-21 20-21 10 0 17 6 20 17-8-3-22-5-35-1-2 1-4 2-5 5Z"
          fill={style.hair}
        />
        <path
          d="M29 43c4 10 9 15 16 15s12-5 16-15c-4 5-9 7-16 7s-12-2-16-7Z"
          fill={style.hair}
          opacity=".82"
        />
      </>
    );
  }

  if (style.variant === 'long') {
    return (
      <>
        <path
          d="M22 31c0-13 9-22 22-22s22 9 22 23c0 10-5 20-9 25H31c-5-6-9-15-9-26Z"
          fill={style.hair}
        />
        <path
          d="M27 31c4-9 10-14 18-14 7 0 13 4 17 12-11-1-21-6-28-13-5 4-7 9-7 15Z"
          fill="#ffffff"
          opacity=".12"
        />
      </>
    );
  }

  if (style.variant === 'side') {
    return (
      <>
        <path
          d="M24 30c1-13 9-21 21-21 11 0 19 7 20 20-10-7-21-9-36-5-2 2-4 4-5 6Z"
          fill={style.hair}
        />
        <path d="M27 25c7-11 20-13 32-4-11 0-19 1-32 4Z" fill="#ffffff" opacity=".14" />
      </>
    );
  }

  return (
    <>
      <path d="M24 29c1-12 9-20 20-20s19 7 21 19c-9-5-21-7-34-4-3 1-5 3-7 5Z" fill={style.hair} />
      <path d="M29 23c7-8 18-9 29-3-10 0-19 1-29 3Z" fill="#ffffff" opacity=".13" />
    </>
  );
}

function CartoonFace({ style }: { style: AvatarStyle }) {
  const hasBeard = style.variant === 'beard';

  return (
    <svg viewBox="0 0 88 88" className="h-full w-full" aria-hidden="true">
      <rect width="88" height="88" rx="44" fill={style.bg} />
      <circle cx="18" cy="16" r="18" fill="#ffffff" opacity=".34" />
      <circle cx="74" cy="74" r="24" fill={style.accent} opacity=".65" />
      <path d="M22 82c4-15 12-22 22-22s18 7 22 22H22Z" fill={style.shirt} />
      <path d="M35 60c2 5 5 8 9 8s7-3 9-8v-8H35v8Z" fill={style.skin} />
      <Hair style={style} />
      <ellipse cx="44" cy="38" rx="18" ry="22" fill={style.skin} />
      <path d="M28 37c-4 0-7 3-7 7s3 7 7 7V37ZM60 37c4 0 7 3 7 7s-3 7-7 7V37Z" fill={style.skin} />
      <path
        d="M33 34c3-2 7-2 10 0"
        stroke="#4b3428"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".55"
      />
      <path
        d="M46 34c3-2 7-2 10 0"
        stroke="#4b3428"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".55"
      />
      <circle cx="38" cy="41" r="2.3" fill="#1f2937" />
      <circle cx="51" cy="41" r="2.3" fill="#1f2937" />
      <path
        d="M44 42c-1 4-2 7-4 9 2 1 5 1 7 0"
        stroke="#9a6747"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".65"
        fill="none"
      />
      {hasBeard && (
        <path
          d="M31 48c3 8 7 12 13 12s11-4 14-12c-4 4-9 6-14 6s-9-2-13-6Z"
          fill={style.hair}
          opacity=".72"
        />
      )}
      <path
        d="M38 54c4 3 9 3 13 0"
        stroke={hasBeard ? '#f8fafc' : '#7f4f36'}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M27 30c4-10 10-15 19-15 8 0 14 5 17 14-11-2-22-6-30-12-4 3-6 8-6 13Z"
        fill={style.variant === 'bob' || style.variant === 'long' ? style.hair : 'transparent'}
      />
    </svg>
  );
}

export function DriverAvatar({ driver, className }: { driver: Driver; className?: string }) {
  const style = styles[driver.avatarKey] ?? styles.emerald;

  return (
    <div
      className={cn(
        'relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background shadow-xs',
        className,
      )}
      aria-label={driver.name}
    >
      {driver.profilePhotoDataUrl ? (
        <img src={driver.profilePhotoDataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <CartoonFace style={style} />
      )}
      <span
        className={cn(
          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
          style.ring,
        )}
      />
    </div>
  );
}
