import { BadgeCheckIcon, CircleXIcon } from "lucide-react"
import type { Metadata } from "next"

import { verifyCertificate } from "@/features/certificates/server/certificate-service"
import { getT } from "@/i18n/server"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  // A verification result is personal: keep it out of search engines.
  return {
    title: t("Verify a certificate"),
    robots: { index: false, follow: false },
  }
}

export default async function VerifyCertificatePage({ params }: PageProps<"/verify/[code]">) {
  const t = await getT()
  const { code } = await params
  const result = /^[0-9a-fA-F]{6,64}$/.test(code) ? await verifyCertificate(await createClient(), code) : null

  return (
    <div className="mx-auto grid max-w-xl gap-6 px-4 pt-16 pb-24 text-center sm:px-6">
      <h1 className="text-3xl font-semibold">{t("Verify a certificate")}</h1>
      {!result ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border p-8">
          <CircleXIcon className="text-destructive size-12" aria-hidden />
          <p className="font-semibold">{t("No certificate matches this code.")}</p>
          <p className="text-muted-foreground text-sm">{t("Check the address printed on the certificate.")}</p>
        </div>
      ) : result.revoked ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-red-300 p-8">
          <CircleXIcon className="text-destructive size-12" aria-hidden />
          <p className="font-semibold">{t("This certificate has been revoked.")}</p>
          <p className="text-muted-foreground text-sm">{result.certificate_no}</p>
        </div>
      ) : (
        <div className="bg-card grid justify-items-center gap-3 rounded-2xl border p-8">
          <BadgeCheckIcon className="text-success size-12" aria-hidden />
          <p className="text-success font-semibold">{t("Valid certificate issued by BSmart Academy")}</p>
          <dl className="grid w-full gap-2 text-left text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <dt className="text-muted-foreground">{t("Learner")}</dt>
            <dd className="font-medium">{result.student_name}</dd>
            <dt className="text-muted-foreground">{t("Course")}</dt>
            <dd className="font-medium">{result.course_name}</dd>
            <dt className="text-muted-foreground">{t("Class")}</dt>
            <dd>{result.class_name}</dd>
            <dt className="text-muted-foreground">{t("Date of issue")}</dt>
            <dd>{formatDate(result.issued_on)}</dd>
            <dt className="text-muted-foreground">{t("Number")}</dt>
            <dd className="font-mono">{result.certificate_no}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}
