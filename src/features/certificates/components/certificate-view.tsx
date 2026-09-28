import { BrandLogo } from "@/components/layout/brand"
import type { CertificateItem } from "@/features/certificates/server/certificate-service"
import { getT } from "@/i18n/server"
import { formatDate } from "@/lib/format"

/**
 * The certificate as printed (A4 landscape): logo unchanged, the learner's
 * name, the course, number, date and a verification address.
 */
export async function CertificateView({ certificate, verifyUrl }: { certificate: CertificateItem; verifyUrl: string }) {
  const t = await getT()
  return (
    <div className="certificate relative mx-auto aspect-[297/210] w-full max-w-5xl overflow-hidden rounded-xl border bg-[#fbf7f1] text-[#2a1d12] shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      {/* Frame in brand colours */}
      <div aria-hidden className="absolute inset-3 rounded-lg border-2 border-[#7b3f00]" />
      <div aria-hidden className="absolute inset-5 rounded-md border border-[#1f2f55]/40" />
      <div className="relative flex h-full flex-col items-center justify-between px-[8%] py-[5%] text-center">
        <BrandLogo className="w-[12%] min-w-16 dark:bg-transparent dark:p-0" />
        <div className="grid gap-[1.2cqw]" style={{ containerType: "inline-size" }}>
          <p className="text-[clamp(10px,1.4vw,16px)] font-semibold tracking-[0.3em] text-[#1f2f55] uppercase">{t("Certificate of completion")}</p>
          <p className="text-[clamp(10px,1.2vw,14px)] text-[#6b5d51]">{t("This certifies that")}</p>
          <p className="font-heading text-[clamp(22px,4.2vw,52px)] leading-tight font-semibold text-[#7b3f00]">{certificate.student_name}</p>
          <p className="text-[clamp(10px,1.2vw,14px)] text-[#6b5d51]">{t("has completed the course")}</p>
          <p className="font-heading text-[clamp(16px,2.6vw,32px)] font-semibold">{certificate.course_name}</p>
          <p className="text-[clamp(9px,1.1vw,13px)] text-[#6b5d51]">
            {t("Class {name}", { name: certificate.class_name })}
            {certificate.completion_percent !== null ? ` · ${t("{value}% of the learning path completed", { value: certificate.completion_percent })}` : ""}
          </p>
          {certificate.note && <p className="text-[clamp(9px,1.1vw,13px)] italic">{certificate.note}</p>}
        </div>
        <div className="grid w-full grid-cols-3 items-end gap-4 text-[clamp(8px,1vw,12px)]">
          <div className="text-left">
            <p className="font-semibold">{formatDate(certificate.issued_on)}</p>
            <p className="text-[#6b5d51]">{t("Date of issue")}</p>
          </div>
          <div>
            <p className="font-heading text-[clamp(10px,1.3vw,16px)] italic">{certificate.issued_by_name || "BSmart Academy"}</p>
            <p className="border-t border-[#2a1d12]/30 pt-1 text-[#6b5d51]">{t("On behalf of BSmart Academy")}</p>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold">{certificate.certificate_no}</p>
            <p className="text-[#6b5d51]">
              {t("Verify at")} <span className="break-all">{verifyUrl}</span>
            </p>
          </div>
        </div>
      </div>
      {certificate.revoked_at && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="rotate-[-18deg] rounded-lg border-4 border-red-700/70 px-6 py-2 text-[clamp(20px,5vw,64px)] font-bold tracking-widest text-red-700/70 uppercase">
            {t("Revoked")}
          </span>
        </div>
      )}
    </div>
  )
}
