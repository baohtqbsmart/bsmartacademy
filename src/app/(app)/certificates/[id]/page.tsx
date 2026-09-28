import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { routes, verifyPath } from "@/config/routes"
import { CertificateView } from "@/features/certificates/components/certificate-view"
import { PrintButton, RevokeCertificateButton } from "@/features/certificates/components/certificate-actions"
import { getCertificate } from "@/features/certificates/server/certificate-service"
import { ShareButtons } from "@/features/site/components/share-buttons"
import { getT } from "@/i18n/server"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { getPublicEnv } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Certificate") }
}

export default async function CertificatePage({ params }: PageProps<"/certificates/[id]">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.certificate)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  // RLS: only whoever may see the student gets a row.
  const certificate = await getCertificate(await createClient(), id)
  if (!certificate) notFound()
  const verifyUrl = new URL(verifyPath(certificate.verify_code), getPublicEnv().NEXT_PUBLIC_SITE_URL).toString()

  return (
    <>
      {/* Printed as one A4 landscape page, colours kept. */}
      <style>
        {
          "@page { size: A4 landscape; margin: 0 } @media print { .certificate { print-color-adjust: exact; -webkit-print-color-adjust: exact; height: 100vh; aspect-ratio: auto } }"
        }
      </style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={routes.certificates} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
          <ArrowLeftIcon className="size-4" aria-hidden /> {t("Certificates")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          {can(user.permissions, "certificates.write") && !certificate.revoked_at && <RevokeCertificateButton id={certificate.id} />}
        </div>
      </div>
      {certificate.revoked_at && <p className="text-destructive text-sm print:hidden">{t("Revoked: {reason}", { reason: certificate.revoke_reason ?? "" })}</p>}
      <CertificateView certificate={certificate} verifyUrl={verifyUrl} />
      {!certificate.revoked_at && (
        <div className="print:hidden">
          <ShareButtons url={verifyUrl} title={`${certificate.course_name} – ${certificate.student_name}`} />
        </div>
      )}
    </>
  )
}
