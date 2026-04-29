import { useEffect, useMemo, useState } from 'react'
import { loadRuleTextOverrides, RULE_TEXT_OVERRIDES_EVENT } from '../lib/ruleTextOverrides'

/** 当前战役下的规则正文覆盖表；同页编辑后通过事件刷新 */
export function useRuleTextOverridesMap(moduleId) {
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const onChange = () => setEpoch((n) => n + 1)
    window.addEventListener(RULE_TEXT_OVERRIDES_EVENT, onChange)
    return () => window.removeEventListener(RULE_TEXT_OVERRIDES_EVENT, onChange)
  }, [])

  return useMemo(() => loadRuleTextOverrides(moduleId), [moduleId, epoch])
}
