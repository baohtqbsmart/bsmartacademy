"use client"

import { PhotoUploader } from "@/components/shared/photo-uploader"
import { markStudentPhotoAction } from "@/features/students/actions"
import { BUCKETS, studentPhotoPath } from "@/lib/storage"

type StudentPhotoUploaderProps = {
  studentId: string
  name: string
  photoUrl: string | null
}

export function StudentPhotoUploader({ studentId, name, photoUrl }: StudentPhotoUploaderProps) {
  return (
    <PhotoUploader
      bucket={BUCKETS.studentPhotos}
      objectPath={studentPhotoPath(studentId)}
      name={name}
      photoUrl={photoUrl}
      className="size-20 text-xl"
      onUploaded={() => markStudentPhotoAction({ studentId })}
    />
  )
}
