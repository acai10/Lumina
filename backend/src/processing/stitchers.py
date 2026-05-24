from collections.abc import Callable

import numpy as np
import scipy.ndimage as ndi
import SimpleITK as sitk
from skimage.registration import phase_cross_correlation

_MATTES_HISTOGRAM_BINS = 50
_AFFINE_TRANSFORM_DIMS = 3
_BIGSTITCHER_UPSAMPLE_FACTOR = 10


def stitch_phase_correlation(vol: np.ndarray, params: dict) -> np.ndarray:
    """Align vol to itself using phase cross-correlation (demo: shift by detected offset)."""
    upsample = int(params.get("upsample_factor", 10))
    # Use middle slice as reference; detect shift between first and middle slice
    ref = vol[vol.shape[0] // 2]
    moving = vol[0]
    shift, _, _ = phase_cross_correlation(ref, moving, upsample_factor=upsample)
    # Apply the detected shift to the entire volume (uniform shift along h/w axes)
    return ndi.shift(vol, shift=[0, shift[0], shift[1]]).astype(np.float32)


def stitch_simpleitk_affine(vol: np.ndarray, params: dict) -> np.ndarray:
    """Affine registration using SimpleITK with Mattes Mutual Information."""
    fixed_img = sitk.GetImageFromArray(vol)
    moving_img = sitk.GetImageFromArray(vol)

    reg = sitk.ImageRegistrationMethod()
    reg.SetMetricAsMattesMutualInformation(numberOfHistogramBins=_MATTES_HISTOGRAM_BINS)
    reg.SetOptimizerAsGradientDescent(
        learningRate=float(params.get("learning_rate", 1.0)),
        numberOfIterations=int(params.get("iterations", 100)),
    )
    reg.SetInitialTransform(
        sitk.CenteredTransformInitializer(
            fixed_img, moving_img, sitk.AffineTransform(_AFFINE_TRANSFORM_DIMS)
        )
    )
    reg.SetInterpolator(sitk.sitkLinear)

    transform = reg.Execute(fixed_img, moving_img)
    resampled = sitk.Resample(moving_img, fixed_img, transform, sitk.sitkLinear, 0.0)
    return sitk.GetArrayFromImage(resampled).astype(np.float32)


def stitch_elastix_bspline(vol: np.ndarray, params: dict) -> np.ndarray:
    """B-spline non-rigid registration via itk-elastix (optional dependency)."""
    try:
        import itk
    except ImportError as exc:
        raise RuntimeError(
            "itk-elastix is not installed. Install with: uv sync --extra elastix"
        ) from exc

    fixed = itk.image_from_array(vol)
    moving = itk.image_from_array(vol)

    parameter_object = itk.ParameterObject.New()
    default_params = parameter_object.GetDefaultParameterMap("bspline")
    default_params["MaximumNumberOfIterations"] = [str(params.get("iterations", 256))]
    parameter_object.AddParameterMap(default_params)

    result, _ = itk.elastix_registration_method(fixed, moving, parameter_object=parameter_object)
    return itk.array_from_image(result).astype(np.float32)


def stitch_bigstitcher(vol: np.ndarray, params: dict) -> np.ndarray:
    """BigStitcher-style global optimisation: pairwise phase-correlation + least-squares fusion."""
    n = vol.shape[0]
    shifts: list[tuple[float, float]] = []

    # Pairwise phase-correlation between consecutive slices
    for i in range(n - 1):
        shift, _, _ = phase_cross_correlation(
            vol[i], vol[i + 1], upsample_factor=_BIGSTITCHER_UPSAMPLE_FACTOR
        )
        shifts.append((float(shift[0]), float(shift[1])))

    # Least-squares accumulation: absolute position from cumulative sum of shifts
    cum_h = np.concatenate([[0.0], np.cumsum([s[0] for s in shifts])])
    cum_w = np.concatenate([[0.0], np.cumsum([s[1] for s in shifts])])

    # Centre the shift so the middle slice has zero offset
    cum_h -= cum_h[n // 2]
    cum_w -= cum_w[n // 2]

    result = np.empty_like(vol)
    for i in range(n):
        result[i] = ndi.shift(vol[i], shift=[cum_h[i], cum_w[i]])
    return result.astype(np.float32)


STITCHER_REGISTRY: dict[str, Callable] = {
    "phase_correlation": stitch_phase_correlation,
    "simpleitk_affine": stitch_simpleitk_affine,
    "elastix_bspline": stitch_elastix_bspline,
    "bigstitcher": stitch_bigstitcher,
}
