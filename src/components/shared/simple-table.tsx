import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type Column<T> = {
  /** Column header; may be a sortable header link. */
  header: React.ReactNode
  /** Stable key; required when `header` is not a string. */
  key?: string
  cell: (row: T) => React.ReactNode
  className?: string
}

type SimpleTableProps<T> = {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  empty: React.ReactNode
  footer?: React.ReactNode
}

/** Read-only table for server-rendered lists. */
export function SimpleTable<T>({ rows, columns, rowKey, empty, footer }: SimpleTableProps<T>) {
  const keyOf = (column: Column<T>) => column.key ?? String(column.header)

  return (
    <Card className="gap-0 py-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={keyOf(column)} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground h-24 text-center whitespace-normal">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((column) => (
                    <TableCell key={keyOf(column)} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {footer && <div className="border-t px-4 py-3">{footer}</div>}
    </Card>
  )
}
