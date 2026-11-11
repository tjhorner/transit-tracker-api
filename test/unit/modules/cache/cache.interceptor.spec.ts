import {
  Controller,
  Get,
  INestApplication,
  Param,
  Query,
  UseInterceptors,
} from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { Cacheable } from "cacheable"
import { CacheQueryParams } from "src/modules/cache/decorators/cache-query-params.decorator"
import { CacheInterceptor } from "src/modules/cache/interceptors/cache.interceptor"
import request from "supertest"

@Controller("items")
@UseInterceptors(CacheInterceptor)
class ItemsController {
  private handledRequests = 0

  @Get("all")
  listAll() {
    return { handledRequests: ++this.handledRequests }
  }

  @Get("filtered")
  @CacheQueryParams("limit", "sort")
  listFiltered(@Query("limit") limit: string, @Query("sort") sort: string) {
    return { handledRequests: ++this.handledRequests, limit, sort }
  }

  @Get(":itemId")
  getItem(@Param("itemId") itemId: string) {
    return { handledRequests: ++this.handledRequests, itemId }
  }
}

describe("CacheInterceptor", () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: Cacheable, useValue: new Cacheable() }],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  function get(url: string) {
    return request(app.getHttpServer()).get(url).expect(200)
  }

  it("serves a repeated request from the cache", async () => {
    await get("/items/all").expect("X-Cache", "MISS")
    await get("/items/all").expect("X-Cache", "HIT")
  })

  it.each([
    ["a query parameter the handler does not name", "/items/all?unused=1"],
    ["different letter case", "/items/ALL"],
    ["a trailing slash", "/items/all/"],
  ])("serves a request with %s from the same entry", async (_, url) => {
    await get("/items/all")
    await get(url).expect("X-Cache", "HIT")
  })

  it("caches each value of a route parameter separately", async () => {
    await get("/items/first")

    const response = await get("/items/second").expect("X-Cache", "MISS")
    expect(response.body.itemId).toBe("second")
  })

  describe("with query parameters named by @CacheQueryParams", () => {
    it("caches each value of a named query parameter separately", async () => {
      await get("/items/filtered?limit=1")

      const response = await get("/items/filtered?limit=2").expect(
        "X-Cache",
        "MISS",
      )
      expect(response.body.limit).toBe("2")
    })

    it("ignores query parameters that are not named", async () => {
      await get("/items/filtered?limit=1")
      await get("/items/filtered?limit=1&unused=1").expect("X-Cache", "HIT")
    })

    it("ignores the order of query parameters in the URL", async () => {
      await get("/items/filtered?limit=1&sort=name")
      await get("/items/filtered?sort=name&limit=1").expect("X-Cache", "HIT")
    })
  })
})
