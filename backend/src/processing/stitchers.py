"""Single-volume stitcher algorithms used for the comparison jobs.

Each entry of :data:`STITCHER_REGISTRY` aligns one volume against a reference and
returns the transformed volume, so they are interchangeable from the job runner's
point of view (the :class:`Stitcher` protocol). They differ in what they can model:
translation only for phase correlation, a global affine transform for SimpleITK,
and a deformable B-spline for elastix.

``itk-elastix`` is an optional dependency, so the elastix stitcher imports it inside
the function and reports a clear error when it is not installed rather than breaking
the module import for everyone.
"""
import logging
from typing import Any, Protocol

import numpy as np
import scipy.ndimage as ndi
import SimpleITK as sitk
from skimage.registration import phase_cross_correlation

logger = logging.getLogger(__name__)


class Stitcher(Protocol):
    """A stitcher aligns *vol*, optionally against a distinct *reference* volume."""

    def __call__(
        self,
        vol: np.ndarray,
        params: dict[str, Any],
        reference: np.ndarray | None = None,
    ) -> np.ndarray: ...


_MATTES_HISTOGRAM_BINS = 50
_AFFINE_TRANSFORM_DIMS = 3
_BIGSTITCHER_UPSAMPLE_FACTOR = 10


def stitch_phase_correlation(
    vol: np.ndarray,
    params: dict[str, Any],
    reference: np.ndarray | None = None,
) -> np.ndarray:
    """Align volume slices using phase cross-correlation.

    Detects the shift between the first and middle slice, then applies
    a uniform shift to the entire volume along the height/width axes.

    Args:
        vol: Float32 array of shape (n_slices, height, width).
        params: Accepts ``upsample_factor`` (int, default 10).
        reference: Ignored — this stitcher aligns slices within *vol* itself.

    Returns:
        Shifted float32 volume of the same shape.
    """
    upsample = int(params.get("upsample_factor", 10))
    ref = vol[vol.shape[0] // 2]
    moving = vol[0]
    shift, _, _ = phase_cross_correlation(ref, moving, upsample_factor=upsample)
    logger.debug("phase_correlation detected shift %s", shift)
    return ndi.shift(vol, shift=[0, shift[0], shift[1]]).astype(np.float32)


def stitch_simpleitk_affine(
    vol: np.ndarray,
    params: dict[str, Any],
    reference: np.ndarray | None = None,
) -> np.ndarray:
    """Global affine registration using SimpleITK with Mattes Mutual Information.

    Registers *vol* (moving) onto *reference* (fixed). Without a distinct
    reference the registration would map the volume onto itself — an expensive
    identity — so callers should pass the unfiltered original as *reference*
    when *vol* is a preprocessed variant.

    Args:
        vol: Moving float32 array of shape (n_slices, height, width).
        params: Accepts ``learning_rate`` (float, default 1.0) and
            ``iterations`` (int, default 100).
        reference: Fixed volume to register onto; defaults to *vol*.

    Returns:
        Resampled float32 volume of the same shape.
    """
    fixed_img = sitk.GetImageFromArray(vol if reference is None else reference)
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


def stitch_elastix_bspline(
    vol: np.ndarray,
    params: dict[str, Any],
    reference: np.ndarray | None = None,
) -> np.ndarray:
    """B-spline non-rigid registration via itk-elastix (optional dependency).

    Registers *vol* (moving) onto *reference* (fixed); without a distinct
    reference this degenerates to an expensive identity (see
    :func:`stitch_simpleitk_affine`). Requires the optional ``itk-elastix``
    package (``uv sync --extra elastix``).

    Args:
        vol: Moving float32 array of shape (n_slices, height, width).
        params: Accepts ``iterations`` (int, default 256).
        reference: Fixed volume to register onto; defaults to *vol*.

    Returns:
        Registered float32 volume of the same shape.

    Raises:
        RuntimeError: If ``itk-elastix`` is not installed.
    """
    try:
        import itk
    except (ImportError, OSError) as exc:
        # OSError covers a present-but-broken native install (missing shared libs).
        raise RuntimeError(
            "itk-elastix is not installed. Install with: uv sync --extra elastix"
        ) from exc

    fixed = itk.image_from_array(vol if reference is None else reference)
    moving = itk.image_from_array(vol)

    parameter_object = itk.ParameterObject.New()
    default_params = parameter_object.GetDefaultParameterMap("bspline")
    default_params["MaximumNumberOfIterations"] = [str(params.get("iterations", 256))]
    parameter_object.AddParameterMap(default_params)

    result, _ = itk.elastix_registration_method(fixed, moving, parameter_object=parameter_object)
    return itk.array_from_image(result).astype(np.float32)


def stitch_bigstitcher(
    vol: np.ndarray,
    params: dict[str, Any],
    reference: np.ndarray | None = None,
) -> np.ndarray:
    """Sequential slice alignment: pairwise phase-correlation, cumulative sum, re-centre.

    Registers every consecutive slice pair by phase correlation, accumulates those
    shifts with a running sum, and centres the result so the middle slice has zero
    offset and the volume does not drift off-canvas.

    The registry name is historical and refers to the tool this was modelled on. Do
    not read it as an implementation of that method: the shifts here are simply
    chained, so an error in one pair carries over to every slice behind it. The
    published BigStitcher (and the tiled-microscopy work it builds on) exists
    precisely to avoid that, by fitting all positions at once by least squares.
    Nothing of the sort happens below.

    Args:
        vol: Float32 array of shape (n_slices, height, width).
        params: Not currently used; reserved for future tuning parameters.
        reference: Ignored — this stitcher aligns slices within *vol* itself.

    Returns:
        Stitched float32 volume of the same shape.
    """
    n = vol.shape[0]
    shifts: list[tuple[float, float]] = []

    for i in range(n - 1):
        shift, _, _ = phase_cross_correlation(
            vol[i], vol[i + 1], upsample_factor=_BIGSTITCHER_UPSAMPLE_FACTOR
        )
        shifts.append((float(shift[0]), float(shift[1])))

    cum_h = np.concatenate([[0.0], np.cumsum([s[0] for s in shifts])])
    cum_w = np.concatenate([[0.0], np.cumsum([s[1] for s in shifts])])

    # Centre the shift so the middle slice has zero offset
    cum_h -= cum_h[n // 2]
    cum_w -= cum_w[n // 2]

    result = np.empty_like(vol)
    for i in range(n):
        result[i] = ndi.shift(vol[i], shift=[cum_h[i], cum_w[i]])
    return result.astype(np.float32)


STITCHER_REGISTRY: dict[str, Stitcher] = {
    "phase_correlation": stitch_phase_correlation,
    "simpleitk_affine": stitch_simpleitk_affine,
    "elastix_bspline": stitch_elastix_bspline,
    "bigstitcher": stitch_bigstitcher,
}
