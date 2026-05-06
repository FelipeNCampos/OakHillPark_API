import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState, type ComponentProps, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import useCustomToast from "@/hooks/useCustomToast"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

export type CrudListResponse<T> = {
  data: T[]
  count: number
}

interface CrudToolbarAction {
  label: string
  onClick: () => void
  variant?: ComponentProps<typeof Button>["variant"]
  disabled?: boolean
  isPending?: boolean
}

interface CrudSectionProps<T extends { id: string }> {
  title: string
  description?: string
  queryKey: string[]
  listFn: (params?: {
    skip?: number
    limit?: number
  }) => Promise<CrudListResponse<T>>
  createFn?: (payload: Record<string, unknown>) => Promise<T>
  updateFn?: (id: string, payload: Record<string, unknown>) => Promise<T>
  deleteFn?: (id: string) => Promise<{ message: string }>
  defaultCreatePayload?: Record<string, unknown>
  searchPlaceholder?: string
  renderMeta?: (data: CrudListResponse<T>) => ReactNode
  toolbarActions?: CrudToolbarAction[]
}

const prettifyJson = (value: Record<string, unknown>) =>
  JSON.stringify(value, null, 2)

const stripId = (value: Record<string, unknown>) => {
  const { id: _, ...rest } = value
  return rest
}

const CrudSection = <T extends { id: string }>({
  title,
  description,
  queryKey,
  listFn,
  createFn,
  updateFn,
  deleteFn,
  defaultCreatePayload,
  searchPlaceholder = "Search records",
  renderMeta,
  toolbarActions = [],
}: CrudSectionProps<T>) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<T | null>(null)
  const [search, setSearch] = useState("")
  const [createJson, setCreateJson] = useState(
    prettifyJson(defaultCreatePayload ?? {}),
  )
  const [editJson, setEditJson] = useState("{}")

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ skip: 0, limit: 100 }),
  })

  const sourceRows = data?.data ?? []
  const normalizedSearch = search.trim().toLowerCase()
  const rows = useMemo(() => {
    if (!normalizedSearch) {
      return sourceRows
    }

    return sourceRows.filter((item) => {
      const haystack = `${item.id} ${JSON.stringify(
        stripId(item as Record<string, unknown>),
      )}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [normalizedSearch, sourceRows])

  const countLabel = useMemo(
    () => `${rows.length} of ${data?.count ?? 0}`,
    [rows.length, data?.count],
  )

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!createFn) {
        throw new Error(`${title} creation is not available`)
      }
      return createFn(payload)
    },
    onSuccess: () => {
      showSuccessToast(`${title} created successfully`)
      setCreateOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: Record<string, unknown>
    }) => {
      if (!updateFn) {
        throw new Error(`${title} update is not available`)
      }
      return updateFn(id, payload)
    },
    onSuccess: () => {
      showSuccessToast(`${title} updated successfully`)
      setEditOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!deleteFn) {
        throw new Error(`${title} deletion is not available`)
      }
      return deleteFn(id)
    },
    onSuccess: () => {
      showSuccessToast(`${title} removed successfully`)
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const parseJson = (raw: string) => {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      showErrorToast("Invalid JSON")
      return null
    }
  }

  const handleCreate = () => {
    const payload = parseJson(createJson)
    if (!payload) {
      return
    }
    createMutation.mutate(payload)
  }

  const handleFormatCreateJson = () => {
    const payload = parseJson(createJson)
    if (!payload) {
      return
    }
    setCreateJson(prettifyJson(payload))
  }

  const handleEdit = () => {
    if (!selected) {
      return
    }
    const payload = parseJson(editJson)
    if (!payload) {
      return
    }
    updateMutation.mutate({ id: selected.id, payload })
  }

  const handleFormatEditJson = () => {
    const payload = parseJson(editJson)
    if (!payload) {
      return
    }
    setEditJson(prettifyJson(payload))
  }

  const handleDelete = () => {
    if (!selected) {
      return
    }
    deleteMutation.mutate(selected.id)
  }

  const openEdit = (item: T) => {
    if (!updateFn) {
      return
    }
    setSelected(item)
    setEditJson(prettifyJson(stripId(item as Record<string, unknown>)))
    setEditOpen(true)
  }

  const openDelete = (item: T) => {
    if (!deleteFn) {
      return
    }
    setSelected(item)
    setDeleteOpen(true)
  }

  const hasRowActions = Boolean(updateFn || deleteFn)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarActions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "outline"}
              onClick={action.onClick}
              disabled={action.disabled || action.isPending}
            >
              {action.isPending ? `${action.label}...` : action.label}
            </Button>
          ))}
          {createFn && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>Add</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>New {title}</DialogTitle>
                  <DialogDescription>
                    Provide the JSON payload to create.
                  </DialogDescription>
                </DialogHeader>
                <textarea
                  value={createJson}
                  onChange={(event) => setCreateJson(event.target.value)}
                  rows={12}
                  className={cn(
                    "w-full rounded-md border border-input bg-transparent p-3 text-sm font-mono shadow-xs",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  )}
                />
                <DialogFooter className="gap-2 sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={handleFormatCreateJson}
                      type="button"
                    >
                      Format JSON
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCreateJson(prettifyJson(defaultCreatePayload ?? {}))
                      }
                      type="button"
                    >
                      Reset template
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      Save
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">Total: {countLabel}</div>
        <div className="w-full sm:max-w-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
      </div>

      {data && renderMeta ? <div>{renderMeta(data)}</div> : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>Loading...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>No records found.</TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.id}
                  </TableCell>
                  <TableCell>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {prettifyJson(stripId(item as Record<string, unknown>))}
                    </pre>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasRowActions ? (
                      <div className="flex justify-end gap-2">
                        {updateFn ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {deleteFn ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openDelete(item)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No actions</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {updateFn ? (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit {title}</DialogTitle>
              <DialogDescription>
                Update the JSON of the selected record.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={editJson}
              onChange={(event) => setEditJson(event.target.value)}
              rows={12}
              className={cn(
                "w-full rounded-md border border-input bg-transparent p-3 text-sm font-mono shadow-xs",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              )}
            />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="ghost"
                onClick={handleFormatEditJson}
                type="button"
              >
                Format JSON
              </Button>
              <div className="flex flex-wrap gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleEdit} disabled={updateMutation.isPending}>
                  Save
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {deleteFn ? (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {title}</DialogTitle>
              <DialogDescription>
                Confirm deletion of the selected record?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

export default CrudSection
