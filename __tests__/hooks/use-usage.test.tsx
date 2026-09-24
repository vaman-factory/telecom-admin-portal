import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { useUsage, type UsageRecord, type UsageFilters } from "@/hooks/use-usage"

const noFilters: UsageFilters = {}

function record(id: number): UsageRecord {
  return {
    id,
    customer_id: 1,
    customer_name: "Ada Lovelace",
    type: "DATA",
    quantity: 1024,
    cost: 4.5,
    recorded_at: null,
  }
}

function pagedResponse(content: UsageRecord[], page: number, hasNext: boolean) {
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

describe("useUsage", () => {
  it("loads the first page on mount", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pagedResponse([record(1)], 0, false)))

    const { result } = renderHook(() => useUsage(noFilters))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(requestedUrls()[0]).toContain("page=0")
    expect(result.current.records).toEqual([record(1)])
    expect(result.current.error).toBeNull()
  })

  it("retries the failed page instead of skipping past it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(pagedResponse([record(1)], 0, true))
        .mockResolvedValueOnce(failedResponse())
        .mockResolvedValueOnce(pagedResponse([record(2)], 1, true))
    )

    const { result } = renderHook(() => useUsage(noFilters))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.error).toBe("Failed to fetch usage records"))

    await act(async () => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.error).toBeNull())

    const urls = requestedUrls()
    expect(urls[1]).toContain("page=1")
    expect(urls[2]).toContain("page=1")
    expect(result.current.records.map((r) => r.id)).toEqual([1, 2])
  })

  it("surfaces an error when the first page fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failedResponse()))

    const { result } = renderHook(() => useUsage(noFilters))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe("Failed to fetch usage records")
    expect(result.current.records).toEqual([])
  })
})
