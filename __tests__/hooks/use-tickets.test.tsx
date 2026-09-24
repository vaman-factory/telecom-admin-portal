import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { useTickets, type Ticket, type TicketFilters } from "@/hooks/use-tickets"

// The hook re-runs its effect whenever the filters object identity changes, so
// tests share one frozen instance instead of relying on the default parameter.
const noFilters: TicketFilters = {}

function ticket(id: number): Ticket {
  return {
    id,
    customer_id: 1,
    customer_name: "Ada Lovelace",
    subject: `Ticket ${id}`,
    description: null,
    priority: "MEDIUM",
    status: "OPEN",
    created_at: null,
    resolved_at: null,
  }
}

function pagedResponse(content: Ticket[], page: number, hasNext: boolean) {
  return {
    ok: true,
    json: async () => ({ content, page, totalPages: 3, totalElements: 3, hasNext }),
  } as Response
}

function failedResponse() {
  return { ok: false, json: async () => null } as Response
}

function requestedUrls() {
  return vi.mocked(fetch).mock.calls.map((call) => String(call[0]))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useTickets", () => {
  it("loads the first page on mount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pagedResponse([ticket(1)], 0, false)))

    const { result } = renderHook(() => useTickets(noFilters))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(requestedUrls()[0]).toContain("page=0")
    expect(result.current.tickets).toEqual([ticket(1)])
    expect(result.current.error).toBeNull()
  })

  it("appends the next page when loadMore succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(pagedResponse([ticket(1)], 0, true))
        .mockResolvedValueOnce(pagedResponse([ticket(2)], 1, false))
    )

    const { result } = renderHook(() => useTickets(noFilters))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.loadMore()
    })

    await waitFor(() => expect(result.current.loadingMore).toBe(false))
    expect(result.current.tickets.map((t) => t.id)).toEqual([1, 2])
    expect(result.current.hasNext).toBe(false)
  })

  it("retries the failed page instead of skipping past it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(pagedResponse([ticket(1)], 0, true))
        .mockResolvedValueOnce(failedResponse())
        .mockResolvedValueOnce(pagedResponse([ticket(2)], 1, true))
    )

    const { result } = renderHook(() => useTickets(noFilters))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.error).toBe("Failed to fetch tickets"))

    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.error).toBeNull())

    const urls = requestedUrls()
    expect(urls[1]).toContain("page=1")
    expect(urls[2]).toContain("page=1")
    expect(result.current.tickets.map((t) => t.id)).toEqual([1, 2])
  })

  it("surfaces an error when the first page fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failedResponse()))

    const { result } = renderHook(() => useTickets(noFilters))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("Failed to fetch tickets")
    expect(result.current.tickets).toEqual([])
  })
})
