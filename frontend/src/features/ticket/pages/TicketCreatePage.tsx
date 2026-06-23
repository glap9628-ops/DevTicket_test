import { useState, FormEvent, ReactElement, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTicket, uploadAttachment } from '@/features/ticket/api';
import type { TicketType } from '@/types/ticket';
import { TICKET_TYPE_LABEL, PRODUCT_OPTIONS, PLATFORM_OPTIONS } from '@/types/ticket';
import MentionInput from '@/components/mention/MentionInput';
import { Copy, CheckCheck } from 'lucide-react';

const TICKET_TYPE_DESC: Record<TicketType, string> = {
  1: 'CI/CD 배포 후 QA 테스트 과정에서 발견된 오류 등록',
  2: '기능 오동작, 버그 신고',
  3: '신규 기능 개발 또는 기존 기능 개선 요청',
  4: '고객사 요청사항 접수 및 개발 대응 필요 건',
  5: '운영 중인 시스템의 유지보수 작업 요청',  // 레거시
};

const TICKET_TYPE_ICONS: Record<TicketType, ReactElement> = {
  1: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  2: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  3: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  4: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  5: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
};

// ─── Extra field 타입 ──────────────────────────────────────────────────────────
/** QA 오류 타입 extra fields — 재현 환경만 남음 (buildVersion/qaFilePath는 직접 컬럼) */
interface QaFields {
  reproEnv: string;
}
interface DevopsFields   { incidentVendor: string; incidentContent: string; }
interface DevFields      { background: string; requirements: string; referenceLink: string; }
interface VendorFields   { vendorName: string; requestContent: string; deadline: string; }
interface MaintFields    { taskContent: string; referenceLink: string; }

// ─── QA 파일 경로 복사 버튼 ────────────────────────────────────────────────────
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors flex-shrink-0"
      style={{
        color: copied ? 'var(--dt-primary-dark)' : 'var(--dt-text-muted)',
        background: copied ? 'var(--dt-primary-light)' : 'var(--dt-bg)',
        border: '1px solid var(--dt-border)',
      }}
      title="경로 복사"
    >
      {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
      {copied ? '복사됨' : '복사'}
    </button>
  );
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
const TicketCreatePage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState<TicketType | null>(null);

  // 공통 필드
  const [title, setTitle]             = useState('');
  const [isUrgent, setIsUrgent]       = useState(false);
  const [productName, setProductName] = useState('');
  const [platform, setPlatform]         = useState('');
  const [errorBug, setErrorBug]         = useState('');
  const [buildVersion, setBuildVersion] = useState('');
  const [qaFilePath, setQaFilePath]     = useState('');

  const [requestedDueDate, setRequestedDueDate] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');

  // Extra fields
  const [qaFields, setQaFields]           = useState<QaFields>({ reproEnv: '' });
  const [devopsFields, setDevopsFields]   = useState<DevopsFields>({ incidentVendor: '', incidentContent: '' });
  const [devFields, setDevFields]         = useState<DevFields>({ background: '', requirements: '', referenceLink: '' });
  const [vendorFields, setVendorFields]   = useState<VendorFields>({ vendorName: '', requestContent: '', deadline: '' });
  const [maintFields, setMaintFields]     = useState<MaintFields>({ taskContent: '', referenceLink: '' });

  const handleTypeSelect = (type: TicketType) => {
    setSelectedType(type);
    setStep('form');
    // QA 전용 필드는 다른 유형으로 전환 시 초기화
    if (type !== 1) {
      setBuildVersion('');
      setQaFilePath('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    setError('');

    if (!title.trim()) { setError('제목을 입력해주세요.'); return; }
    if (title.trim().length > 200) { setError('제목은 200자 이내로 입력해주세요.'); return; }
    if (!productName) { setError('제품명을 선택해주세요.'); return; }
    if (!platform) { setError('플랫폼을 선택해주세요.'); return; }

    setSubmitting(true);

    let extraFields: Record<string, unknown> = {};

    if (selectedType === 1) {
      if (!qaFilePath.trim()) {
        setError('QA 파일 경로는 필수 입력입니다.');
        setSubmitting(false);
        return;
      }
      // reproEnv만 extraFields에 저장 (buildVersion, qaFilePath는 직접 컬럼)
      if (qaFields.reproEnv.trim()) extraFields = { reproEnv: qaFields.reproEnv.trim() };
    } else if (selectedType === 2) {
      if (!devopsFields.incidentVendor.trim())  { setError('장애업체는 필수 입력입니다.'); setSubmitting(false); return; }
      if (!devopsFields.incidentContent.trim()) { setError('장애내용은 필수 입력입니다.'); setSubmitting(false); return; }
      extraFields = { ...devopsFields };
    } else if (selectedType === 3) {
      if (!devFields.background.trim() || !devFields.requirements.trim()) {
        setError('요청 배경과 요구사항은 필수 입력입니다.');
        setSubmitting(false);
        return;
      }
      extraFields = { ...devFields };
    } else if (selectedType === 4) {
      if (!vendorFields.vendorName.trim())    { setError('업체명은 필수 입력입니다.'); setSubmitting(false); return; }
      if (!vendorFields.requestContent.trim()){ setError('요청 내용은 필수 입력입니다.'); setSubmitting(false); return; }
      extraFields = { ...vendorFields };
    } else if (selectedType === 5) {
      if (!maintFields.taskContent.trim()) { setError('작업 내용은 필수 입력입니다.'); setSubmitting(false); return; }
      extraFields = { ...maintFields };
    }

    try {
      let attachmentPath: string | undefined;
      if (attachmentFile) {
        const uploaded = await uploadAttachment(attachmentFile);
        attachmentPath = uploaded.filename;
      }

      await createTicket({
        ticketType: selectedType,
        title: title.trim(),
        isUrgent,
        productName: productName || undefined,
        platform,
        errorBug: errorBug.trim() || undefined,
        buildVersion: buildVersion.trim() || undefined,
        qaFilePath: qaFilePath.trim() || undefined,
        attachmentPath,
        requestedDueDate: requestedDueDate || undefined,
        extraFields,
      });
      navigate('/board');
    } catch (err) {
      setError(err instanceof Error ? err.message : '티켓 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dt-page">
      <div className="dt-page-header">
        <div>
          <h1 className="dt-page-title">티켓 등록</h1>
          <p className="dt-page-subtitle">새 티켓을 등록합니다</p>
        </div>
        <button className="dt-btn dt-btn-secondary" onClick={() => navigate('/board')}>
          취소
        </button>
      </div>

      {/* ── Step 1: 유형 선택 ── */}
      {step === 'type' && (
        <div>
          <p className="text-sm text-gray-600 mb-5">티켓 유형을 선택해주세요.</p>
          <div className="grid grid-cols-2 gap-4">
            {([1, 2, 3, 4] as TicketType[]).map((type) => (
              <button
                key={type}
                className="dt-type-card"
                onClick={() => handleTypeSelect(type)}
              >
                <div className="dt-type-card-icon">{TICKET_TYPE_ICONS[type]}</div>
                <div className="dt-type-card-label">{TICKET_TYPE_LABEL[type]}</div>
                <div className="dt-type-card-desc">{TICKET_TYPE_DESC[type]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: 폼 입력 ── */}
      {step === 'form' && selectedType && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 유형 변경 버튼 */}
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-[var(--dt-primary)] hover:text-[var(--dt-primary-dark)]"
            onClick={() => setStep('type')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            유형 변경
          </button>

          {/* 선택된 유형 배지 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">선택된 유형:</span>
            <span className="inline-block px-2.5 py-1 rounded-full bg-[var(--dt-primary-light)] text-[var(--dt-primary)] text-sm font-semibold">
              {TICKET_TYPE_LABEL[selectedType]}
            </span>
          </div>

          {/* ── 기본 정보 ── */}
          <div className="dt-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3">기본 정보</h3>

            {/* 제목 */}
            <div>
              <label className="dt-label flex items-center justify-between">
                <span>제목 <span className="text-red-500">*</span></span>
                <span className={`text-xs font-normal ${title.length > 180 ? 'text-rose-500' : 'text-gray-400'}`}>
                  {title.length}/200
                </span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                placeholder="티켓 제목을 입력하세요"
                className="dt-input w-full"
              />
            </div>

            {/* 제품명 + 플랫폼 (2열) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="dt-label">제품명 <span className="text-red-500">*</span></label>
                <select
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  required
                  className="dt-select w-full"
                >
                  <option value="">-- 제품명 선택 --</option>
                  {PRODUCT_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="dt-label">
                  플랫폼 <span className="text-red-500">*</span>
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  required
                  className="dt-select w-full"
                >
                  <option value="">-- 플랫폼 선택 --</option>
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error/Bug — QA오류 타입만 표시 */}
            {selectedType === 1 && (
              <div>
                <label className="dt-label">Error / Bug</label>
                <input
                  type="text"
                  value={errorBug}
                  onChange={(e) => setErrorBug(e.target.value)}
                  placeholder="예: NullPointerException, build-error-203, ERR_AUTH_TIMEOUT"
                  className="dt-input w-full"
                />
                <p className="mt-1 text-xs text-gray-400">CI/CD 빌드 오류 코드 또는 버그 식별자를 입력하세요.</p>
              </div>
            )}

            {/* 빌드버전 + QA 파일경로 — QA 오류 타입일 때만 표시 */}
            {selectedType === 1 && (
              <>
                <div>
                  <label className="dt-label">빌드/버전 번호</label>
                  <input
                    type="text"
                    value={buildVersion}
                    onChange={(e) => setBuildVersion(e.target.value)}
                    placeholder="예: v1.2.3 / build-203"
                    className="dt-input w-full"
                  />
                </div>
                <div>
                  <label className="dt-label">
                    QA 파일 경로 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={qaFilePath}
                      onChange={(e) => setQaFilePath(e.target.value)}
                      placeholder="/QA/2026/05/build_203/error_log.zip"
                      className="dt-input flex-1 font-mono text-sm"
                      style={{ minWidth: 0 }}
                    />
                    <CopyButton text={qaFilePath} />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    ECM 업로드 경로 또는 QA 결과 파일 경로를 입력하세요.
                  </p>
                </div>
              </>
            )}

            {/* 희망 완료일 */}
            <div>
              <label className="dt-label">희망 완료일</label>
              <input
                type="date"
                value={requestedDueDate}
                onChange={(e) => setRequestedDueDate(e.target.value)}
                className="dt-input"
              />
              <p className="mt-1 text-xs text-gray-400">완료되길 원하는 날짜를 입력하세요 (선택사항).</p>
            </div>

            {/* 첨부파일 */}
            <div>
              <label className="dt-label">첨부파일</label>
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
                style={{ borderColor: attachmentFile ? 'var(--dt-primary)' : 'var(--dt-border)', background: 'var(--dt-bg)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--dt-text-muted)', flexShrink: 0 }}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                {attachmentFile ? (
                  <span className="text-sm flex-1 truncate" style={{ color: 'var(--dt-primary)' }}>{attachmentFile.name}</span>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--dt-text-muted)' }}>파일을 선택하세요 (선택사항, 최대 20MB)</span>
                )}
                {attachmentFile && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAttachmentFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'var(--dt-text-muted)', background: 'var(--dt-bg-secondary)' }}
                  >
                    제거
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* 긴급 */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">긴급 처리 요청</span>
                <span className="text-xs text-gray-500">(우선 처리 요청)</span>
              </label>
            </div>
          </div>

          {/* ── 상세 정보 (타입별) ── */}
          <div className="dt-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-3">상세 정보</h3>

            {/* QA 오류 — 재현 환경만 (빌드버전/QA파일경로는 기본 정보 섹션으로 이동) */}
            {selectedType === 1 && (
              <div>
                <label className="dt-label">재현 환경</label>
                <input
                  type="text"
                  value={qaFields.reproEnv}
                  onChange={(e) => setQaFields(f => ({ ...f, reproEnv: e.target.value }))}
                  placeholder="예: Windows 10, Chrome 120 / Android 14"
                  className="dt-input w-full"
                />
              </div>
            )}

            {/* 데브옵스 */}
            {selectedType === 2 && (
              <>
                <div>
                  <label className="dt-label">장애업체 <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="text"
                    value={devopsFields.incidentVendor}
                    onChange={(e) => setDevopsFields(f => ({ ...f, incidentVendor: e.target.value }))}
                    placeholder="예: 이노티움, AWS, Kakao"
                    className="dt-input w-full"
                  />
                </div>
                <div>
                  <label className="dt-label">장애내용 <span className="text-red-500">*</span></label>
                  <MentionInput
                    value={devopsFields.incidentContent}
                    onChange={(v) => setDevopsFields(f => ({ ...f, incidentContent: v }))}
                    placeholder="장애 증상 및 상세 내용"
                    rows={7}
                  />
                </div>
              </>
            )}

            {/* 내부개발 */}
            {selectedType === 3 && (
              <>
                <div>
                  <label className="dt-label">요청 배경 <span className="text-red-500">*</span></label>
                  <MentionInput
                    value={devFields.background}
                    onChange={(v) => setDevFields(f => ({ ...f, background: v }))}
                    placeholder="요청의 배경 및 이유"
                    rows={4}
                  />
                </div>
                <div>
                  <label className="dt-label">요구사항 <span className="text-red-500">*</span></label>
                  <MentionInput
                    value={devFields.requirements}
                    onChange={(v) => setDevFields(f => ({ ...f, requirements: v }))}
                    placeholder="구체적인 요구사항 목록"
                    rows={6}
                  />
                </div>
                <div>
                  <label className="dt-label">참고 자료 (링크)</label>
                  <input
                    type="url"
                    value={devFields.referenceLink}
                    onChange={(e) => setDevFields(f => ({ ...f, referenceLink: e.target.value }))}
                    placeholder="https://..."
                    className="dt-input w-full"
                  />
                </div>
              </>
            )}

            {/* 업체요청 */}
            {selectedType === 4 && (
              <>
                <div>
                  <label className="dt-label">업체명 <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="text"
                    value={vendorFields.vendorName}
                    onChange={(e) => setVendorFields(f => ({ ...f, vendorName: e.target.value }))}
                    placeholder="업체 이름"
                    className="dt-input w-full"
                  />
                </div>
                <div>
                  <label className="dt-label">요청 내용 <span className="text-red-500">*</span></label>
                  <MentionInput
                    value={vendorFields.requestContent}
                    onChange={(v) => setVendorFields(f => ({ ...f, requestContent: v }))}
                    placeholder="업체 요청사항 상세"
                    rows={6}
                  />
                </div>
              </>
            )}

            {/* 유지보수 */}
            {selectedType === 5 && (
              <>
                <div>
                  <label className="dt-label">작업 내용 <span className="text-red-500">*</span></label>
                  <MentionInput
                    value={maintFields.taskContent}
                    onChange={(v) => setMaintFields(f => ({ ...f, taskContent: v }))}
                    placeholder="수행할 유지보수 작업의 상세 내용"
                    rows={7}
                  />
                </div>
                <div>
                  <label className="dt-label">참고 자료 (링크)</label>
                  <input
                    type="url"
                    value={maintFields.referenceLink}
                    onChange={(e) => setMaintFields(f => ({ ...f, referenceLink: e.target.value }))}
                    placeholder="https://..."
                    className="dt-input w-full"
                  />
                </div>
              </>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="dt-btn dt-btn-primary">
              {submitting ? '등록 중...' : '티켓 등록'}
            </button>
            <button type="button" className="dt-btn dt-btn-secondary" onClick={() => navigate('/board')}>
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default TicketCreatePage;
