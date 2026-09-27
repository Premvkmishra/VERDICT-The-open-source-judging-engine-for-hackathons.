import math
from typing import List, Dict, Any, Optional, Tuple

def normalize_criterion_value(value: float, scale_min: float, scale_max: float) -> float:
    if scale_max <= scale_min:
        return 1.0
    return (value - scale_min) / (scale_max - scale_min)

def weighted_evaluation_score(
    scores: List[Dict[str, Any]], criteria: List[Dict[str, Any]]
) -> float:
    criteria_by_id = {str(c["id"]): c for c in criteria}
    total_weighted_n = 0.0
    total_weight = 0.0

    for s in scores:
        crit_id = str(s["criterion_id"])
        if crit_id in criteria_by_id:
            crit = criteria_by_id[crit_id]
            val = float(s["value"])
            w = float(crit.get("weight", 1.0))
            scale_min = float(crit.get("scale_min", 1))
            scale_max = float(crit.get("scale_max", 5))
            n_c = normalize_criterion_value(val, scale_min, scale_max)
            total_weighted_n += w * n_c
            total_weight += w

    if total_weight <= 0:
        return 0.0
    return total_weighted_n / total_weight

def calculate_judge_stats(raw_scores: List[float]) -> Dict[str, Any]:
    n = len(raw_scores)
    if n == 0:
        return {"n": 0, "mean": 0.0, "stdev": 0.0, "normalizable": False}

    mean = sum(raw_scores) / n
    if n < 2:
        stdev = 0.0
    else:
        variance = sum((x - mean) ** 2 for x in raw_scores) / (n - 1)
        stdev = math.sqrt(max(0.0, variance))

    normalizable = (n >= 3) and (stdev >= 0.01)
    return {"n": n, "mean": mean, "stdev": stdev, "normalizable": normalizable}

def z_score(r: float, mean: float, stdev: float) -> float:
    if stdev <= 0:
        return 0.0
    return (r - mean) / stdev

def aggregate_official_score(z_scores_with_weights: List[Tuple[float, float]]) -> Optional[float]:
    if not z_scores_with_weights:
        return None
    total_weight = sum(w for _, w in z_scores_with_weights)
    if total_weight <= 0:
        return None
    return sum(z * w for z, w in z_scores_with_weights) / total_weight

def is_rankable(
    reviews_count: int, has_normalizable_judge: bool, min_reviews_per_project: int = 3
) -> bool:
    return (reviews_count >= min_reviews_per_project) and has_normalizable_judge

def display_score(
    official_score: Optional[float], min_official: float, max_official: float
) -> Optional[float]:
    if official_score is None:
        return None
    if abs(max_official - min_official) < 1e-9:
        return 50.0
    return 100.0 * (official_score - min_official) / (max_official - min_official)

def bradley_terry(
    pairwise_comparisons: List[Dict[str, Any]], project_ids: List[str], max_iter: int = 100
) -> Dict[str, float]:
    if not project_ids:
        return {}

    wins = {pid: 0 for pid in project_ids}
    matches = {pid: [] for pid in project_ids}

    for comp in pairwise_comparisons:
        pa = str(comp["project_a_id"])
        pb = str(comp["project_b_id"])
        winner = str(comp["winner_project_id"])
        if pa in wins and pb in wins:
            if winner == pa:
                wins[pa] += 1
            elif winner == pb:
                wins[pb] += 1
            matches[pa].append(pb)
            matches[pb].append(pa)

    strengths = {pid: 1.0 for pid in project_ids}
    num_projects = len(project_ids)

    for _ in range(max_iter):
        new_strengths = {}
        for pid in project_ids:
            w_p = wins[pid]
            denom = sum(1.0 / (strengths[pid] + strengths[opponent]) for opponent in matches[pid])
            if denom > 0:
                new_strengths[pid] = w_p / denom
            else:
                new_strengths[pid] = strengths[pid]

        total_s = sum(new_strengths.values())
        if total_s > 0:
            strengths = {pid: (val / total_s) * num_projects for pid, val in new_strengths.items()}
        else:
            break

    return strengths

def rank_and_break_ties(projects_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # projects_data items:
    # { 'project_id', 'official_score', 'yes_pref_count', 'bt_score', 'raw_mean', 'is_rankable', ... }
    rankable = [p for p in projects_data if p.get("is_rankable")]
    unrankable = [p for p in projects_data if not p.get("is_rankable")]

    def sort_key(p):
        return (
            p.get("official_score") if p.get("official_score") is not None else -999999.0,
            p.get("yes_pref_count", 0),
            p.get("bt_score") if p.get("bt_score") is not None else -999999.0,
            p.get("raw_mean", 0.0),
        )

    rankable.sort(key=sort_key, reverse=True)

    # Assign ranks and determine tie_break_reason
    result = []
    current_rank = 1
    i = 0
    while i < len(rankable):
        j = i + 1
        # Find group of tied projects on official_score
        while j < len(rankable) and abs(rankable[i]["official_score"] - rankable[j]["official_score"]) < 1e-9:
            j += 1

        tied_group = rankable[i:j]
        if len(tied_group) == 1:
            item = dict(tied_group[0])
            item["rank"] = current_rank
            item["tie_break_reason"] = "none"
            result.append(item)
            current_rank += 1
            i = j
        else:
            # Tie breaking sequence
            for idx, item in enumerate(tied_group):
                item_copy = dict(item)
                item_copy["rank"] = current_rank + idx

                # Determine which step broke the tie relative to others in group
                reason = "project_id"
                if any(x["yes_pref_count"] != tied_group[0]["yes_pref_count"] for x in tied_group):
                    reason = "final_preference_count"
                elif any(x.get("bt_score") != tied_group[0].get("bt_score") for x in tied_group if x.get("bt_score") is not None):
                    reason = "bradley_terry_score"
                elif any(abs(x.get("raw_mean", 0) - tied_group[0].get("raw_mean", 0)) > 1e-9 for x in tied_group):
                    reason = "raw_score_mean"

                item_copy["tie_break_reason"] = reason
                result.append(item_copy)

            current_rank += len(tied_group)
            i = j

    for item in unrankable:
        item_copy = dict(item)
        item_copy["rank"] = None
        item_copy["official_score"] = None
        item_copy["display_score"] = None
        item_copy["tie_break_reason"] = "none"
        result.append(item_copy)

    return result
