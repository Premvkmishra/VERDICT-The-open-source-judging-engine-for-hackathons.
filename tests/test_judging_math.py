import pytest
from app.engine import scoring

def test_judging_worked_example_section_11():
    """
    Tests JUDGING.md §11 Worked Example:
    Rubric: Idea (weight 1, scale 1-4), Execution (weight 2, scale 1-4), Impact (weight 1, scale 1-4).
    Scores: Idea=3, Execution=4, Impact=2.
    n_idea = (3-1)/(4-1) = 0.667
    n_exec = (4-1)/(4-1) = 1.000
    n_impact = (2-1)/(4-1) = 0.333
    R = (1*0.667 + 2*1.000 + 1*0.333) / 4 = 0.75 -> raw display: 3.75
    If μ=0.60, σ=0.18: z = (0.75 - 0.60) / 0.18 = 0.833
    """
    criteria = [
        {"id": "crit_idea", "weight": 1.0, "scale_min": 1, "scale_max": 4},
        {"id": "crit_exec", "weight": 2.0, "scale_min": 1, "scale_max": 4},
        {"id": "crit_impact", "weight": 1.0, "scale_min": 1, "scale_max": 4},
    ]

    scores = [
        {"criterion_id": "crit_idea", "value": 3},
        {"criterion_id": "crit_exec", "value": 4},
        {"criterion_id": "crit_impact", "value": 2},
    ]

    r_jp = scoring.weighted_evaluation_score(scores, criteria)
    assert pytest.approx(r_jp, abs=1e-3) == 0.75
    assert pytest.approx(r_jp * 5.0, abs=1e-3) == 3.75

    # Z-score calculation
    mu = 0.60
    sigma = 0.18
    stats = scoring.calculate_judge_stats([0.42, 0.60, 0.78, 0.60]) # mean ~0.60
    assert stats["normalizable"] is True

    z = scoring.z_score(r_jp, mu, sigma)
    assert pytest.approx(z, abs=1e-3) == 0.833

def test_zero_variance_judge_anomaly():
    """
    Tests JUDGING.md §3: A judge with stdev < 0.01 is non-normalizable.
    """
    scores = [3.0, 3.0, 3.0]
    stats = scoring.calculate_judge_stats(scores)
    assert stats["n"] == 3
    assert stats["stdev"] == 0.0
    assert stats["normalizable"] is False

def test_insufficient_reviews_judge_anomaly():
    """
    Tests JUDGING.md §3: A judge with n < 3 reviews is non-normalizable.
    """
    scores = [4.0, 2.0]
    stats = scoring.calculate_judge_stats(scores)
    assert stats["n"] == 2
    assert stats["normalizable"] is False

def test_display_score_min_max_scaling():
    """
    Tests JUDGING.md §6: min-max scaling to 0..100.
    """
    assert scoring.display_score(0.833, 0.0, 1.0) == 83.3
    # Zero spread fallback to 50
    assert scoring.display_score(1.0, 1.0, 1.0) == 50.0
