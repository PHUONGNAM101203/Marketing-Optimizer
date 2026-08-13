import 'server-only'

import { computeCategoryScore, type AuditFinding } from '@/lib/domain/audit'
import type { SiteCrawl } from '../crawler'
import { evaluateSeoRules } from './seo'
import { evaluateGeoRules } from './geo'
import { evaluateAioRules } from './aio'

export interface AuditScores {
  readonly findings: readonly AuditFinding[]
  readonly seoScore: number | null
  readonly geoScore: number | null
  readonly aioScore: number | null
}

export const evaluateAllRules = (crawl: SiteCrawl): AuditScores => {
  const seoFindings = evaluateSeoRules(crawl)
  const geoFindings = evaluateGeoRules(crawl)
  const aioFindings = evaluateAioRules(crawl)

  return {
    findings: [...seoFindings, ...geoFindings, ...aioFindings],
    seoScore: computeCategoryScore(seoFindings),
    geoScore: computeCategoryScore(geoFindings),
    aioScore: computeCategoryScore(aioFindings),
  }
}
