"""
test_predict.py — sanity check for predict_nowcast.py, using zero live data.
Feeds it the SAME input from the saved replay example, and compares the
fresh prediction against the prediction that was recorded back in Colab
right after training. They should match closely (small floating-point
differences are fine — this isn't re-training, just re-running inference
on the same weights) — confirms the exported model actually works before
we wire in live data.
"""
import json
import subprocess
import numpy as np

with open('data/nowcast_replay_example.json') as f:
    example = json.load(f)

input_mm = example['inputMm']
recorded_prediction = np.array(example['predictedFutureMm'])

result = subprocess.run(
    ['python', 'predict_nowcast.py'],
    input=json.dumps(input_mm),
    capture_output=True, text=True,
)

if result.returncode != 0:
    print("SCRIPT FAILED")
    print("stdout:", result.stdout)
    print("stderr:", result.stderr)
else:
    fresh_prediction = np.array(json.loads(result.stdout))
    diff = np.abs(fresh_prediction - recorded_prediction)
    print("Fresh prediction shape:", fresh_prediction.shape)
    print("Max difference from recorded prediction:", diff.max())
    print("Mean difference from recorded prediction:", diff.mean())
    print("PASS — matches closely" if diff.max() < 0.05 else "CHECK — larger difference than expected")
