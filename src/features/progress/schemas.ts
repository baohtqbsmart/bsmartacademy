import { z } from "zod"

/** Place an assignment or test in a module of its class's course (null: no module). */
export const setWorkUnitSchema = z.object({
  kind: z.enum(["assignment", "test"]),
  id: z.uuid(),
  unitId: z.uuid().nullable(),
})
