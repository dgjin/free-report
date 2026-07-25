import React, { useEffect, useState } from 'react';

/**
 * 轻量 toast 通知系统，替代原生 alert/confirm：
 * - 不阻塞 JS 主线程与页面交互
 * - toast：右上角滑入，3.2s 自动消失
 * - confirmDialog：Promise 版确认框，await 获取用户选择
 */

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (value: boolean) => void;
}

let nextId = 1;
const toastListeners = new Set<(t: ToastItem) => void>();
const confirmListeners = new Set<(c: ConfirmRequest) => void>();

/** 轻提示（替代 alert） */
export function toast(message: string, type: ToastType = 'info') {
  const item: ToastItem = { id: nextId++, message, type };
  toastListeners.forEach((fn) => fn(item));
}

/** Promise 版确认框（替代 confirm），用法：if (!(await confirmDialog('...'))) return; */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req: ConfirmRequest = { id: nextId++, message, resolve };
    confirmListeners.forEach((fn) => fn(req));
  });
}

interface PromptRequest {
  id: number;
  message: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

const promptListeners = new Set<(p: PromptRequest) => void>();

/** Promise 版输入框（替代 prompt），返回输入文本或 null（取消） */
export function promptDialog(message: string, placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req: PromptRequest = { id: nextId++, message, placeholder, resolve };
    promptListeners.forEach((fn) => fn(req));
  });
}

const PromptCard: React.FC<{
  req: PromptRequest;
  onClose: (req: PromptRequest, value: string | null) => void;
}> = ({ req, onClose }) => {
  const [value, setValue] = useState('');
  return (
    <div
      className="toast-pop-in w-[380px] rounded-2xl border border-black/[0.06] p-5"
      style={{
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
      }}
    >
      <div className="text-[14px] font-semibold text-slate-800 mb-3">{req.message}</div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClose(req, value);
          if (e.key === 'Escape') onClose(req, null);
        }}
        placeholder={req.placeholder}
        className="w-full h-10 px-3 rounded-lg border border-black/[0.1] text-[13px] text-slate-700 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 mb-4"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={() => onClose(req, null)}
          className="px-4 h-9 rounded-lg text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          取消
        </button>
        <button
          onClick={() => onClose(req, value)}
          className="px-4 h-9 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#0071e3,#0a84ff)' }}
        >
          确认
        </button>
      </div>
    </div>
  );
};

const typeStyles: Record<ToastType, { bar: string; icon: string }> = {
  success: { bar: 'bg-emerald-500', icon: '✓' },
  error: { bar: 'bg-red-500', icon: '✕' },
  info: { bar: 'bg-blue-500', icon: 'ℹ' },
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);
  const [prompts, setPrompts] = useState<PromptRequest[]>([]);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3200);
    };
    const onConfirm = (c: ConfirmRequest) => setConfirms((prev) => [...prev, c]);
    const onPrompt = (p: PromptRequest) => setPrompts((prev) => [...prev, p]);
    toastListeners.add(onToast);
    confirmListeners.add(onConfirm);
    promptListeners.add(onPrompt);
    return () => {
      toastListeners.delete(onToast);
      confirmListeners.delete(onConfirm);
      promptListeners.delete(onPrompt);
    };
  }, []);

  const closeConfirm = (req: ConfirmRequest, value: boolean) => {
    setConfirms((prev) => prev.filter((x) => x.id !== req.id));
    req.resolve(value);
  };

  const closePrompt = (req: PromptRequest, value: string | null) => {
    setPrompts((prev) => prev.filter((x) => x.id !== req.id));
    req.resolve(value);
  };

  return (
    <>
      {/* toast 栈：右上角滑入 */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const s = typeStyles[t.type];
          return (
            <div
              key={t.id}
              className="toast-slide-in pointer-events-auto flex items-stretch min-w-[240px] max-w-[380px] rounded-xl overflow-hidden border border-black/[0.06]"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
              }}
            >
              <div className={`w-1 ${s.bar}`} />
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <span
                  className={`w-5 h-5 rounded-full ${s.bar} text-white text-[11px] font-bold flex items-center justify-center shrink-0`}
                >
                  {s.icon}
                </span>
                <span className="text-[13px] text-slate-700 leading-snug">{t.message}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* prompt 输入框：居中弹层，不阻塞页面 JS */}
      {prompts.length > 0 && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          {prompts.map((p) => (
            <PromptCard key={p.id} req={p} onClose={closePrompt} />
          ))}
        </div>
      )}

      {/* confirm 对话框：居中弹层，不阻塞页面 JS */}
      {confirms.length > 0 && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          style={{ background: 'rgba(15,23,42,0.28)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          {confirms.map((c) => (
            <div
              key={c.id}
              className="toast-pop-in w-[380px] rounded-2xl border border-black/[0.06] p-5"
              style={{
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
              }}
            >
              <div className="text-[14px] font-semibold text-slate-800 mb-1.5">操作确认</div>
              <div className="text-[13px] text-slate-600 leading-relaxed mb-4">{c.message}</div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => closeConfirm(c, false)}
                  className="px-4 h-9 rounded-lg text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => closeConfirm(c, true)}
                  className="px-4 h-9 rounded-lg text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#0071e3,#0a84ff)' }}
                >
                  确认
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
