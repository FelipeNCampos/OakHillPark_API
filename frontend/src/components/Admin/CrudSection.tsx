import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"

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
import useCustomToast from "@/hooks/useCustomToast"
import { cn } from "@/lib/utils"
import { handleError } from "@/utils"

export type CrudListResponse<T> = {
  data: T[]
  count: number
}

interface CrudSectionProps<T extends { id: string }> {
  title: string
  description?: string
  queryKey: string[]
  listFn: (params?: { skip?: number; limit?: number }) => Promise<CrudListResponse<T>>
  createFn: (payload: Record<string, unknown>) => Promise<T>
  updateFn: (id: string, payload: Record<string, unknown>) => Promise<T>
  deleteFn: (id: string) => Promise<{ message: string }>
  defaultCreatePayload: Record<string, unknown>
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
}: CrudSectionProps<T>) => {
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selected, setSelected] = useState<T | null>(null)
  const [createJson, setCreateJson] = useState(
    prettifyJson(defaultCreatePayload),
  )
  const [editJson, setEditJson] = useState("{}")

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ skip: 0, limit: 100 }),
  })

  const rows = data?.data ?? []
  const countLabel = useMemo(() => `${rows.length} de ${data?.count ?? 0}`, [
    rows.length,
    data?.count,
  ])

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createFn(payload),
    onSuccess: () => {
      showSuccessToast(`${title} criado com sucesso`)
      setCreateOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateFn(id, payload),
    onSuccess: () => {
      showSuccessToast(`${title} atualizado com sucesso`)
      setEditOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn(id),
    onSuccess: () => {
      showSuccessToast(`${title} removido com sucesso`)
      setDeleteOpen(false)
      queryClient.invalidateQueries({ queryKey })
    },
    onError: handleError.bind(showErrorToast),
  })

  const parseJson = (raw: string) => {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      showErrorToast("JSON inválido")
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

  const handleDelete = () => {
    if (!selected) {
      return
    }
    deleteMutation.mutate(selected.id)
  }

  const openEdit = (item: T) => {
    setSelected(item)
    setEditJson(prettifyJson(stripId(item as Record<string, unknown>)))
    setEditOpen(true)
  }

  const openDelete = (item: T) => {
    setSelected(item)
    setDeleteOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Adicionar</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Novo {title}</DialogTitle>
              <DialogDescription>
                Informe o JSON do payload para criar.
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
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="text-sm text-muted-foreground">Total: {countLabel}</div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Dados</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3}>Carregando...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>Nenhum registro encontrado.</TableCell>
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
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDelete(item)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar {title}</DialogTitle>
            <DialogDescription>
              Atualize o JSON do registro selecionado.
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
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {title}</DialogTitle>
            <DialogDescription>
              Confirma a exclusão do registro selecionado?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CrudSection
