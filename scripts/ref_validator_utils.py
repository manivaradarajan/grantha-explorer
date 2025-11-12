from typing import List, Dict, Tuple, Any

def parse_ref(ref: str) -> Tuple[int, ...]:
    """Converts a ref string like '3.1.1' or '6.3.24-30' into a tuple of integers."""
    try:
        # Handle ranges by taking the start of the range
        ref_part = ref.split('-')[0]
        return tuple(map(int, ref_part.split('.')))
    except ValueError:
        # print(f"Warning: Could not parse ref string: {ref}") # Suppress warning in utility
        return ()

def is_monotonically_increasing(refs: List[str], file_path: str, context: str, error_log: List[str] = None) -> bool:
    """
    Validates that the 'ref' in a list of ref strings is monotonically increasing.
    Logs errors to the provided error_log list or prints them to stdout.
    Returns True if valid, False otherwise.
    """
    is_valid = True
    last_ref_tuple = None
    for ref_str in refs:
        current_ref_tuple = parse_ref(ref_str)
        if not current_ref_tuple:
            # If a ref cannot be parsed, we can't validate it, but don't fail the whole file
            continue

        if last_ref_tuple:
            # Normalize tuples to the same length for comparison
            max_len = max(len(current_ref_tuple), len(last_ref_tuple))
            current_ref_padded = current_ref_tuple + (0,) * (max_len - len(current_ref_tuple))
            last_ref_padded = last_ref_tuple + (0,) * (max_len - len(last_ref_tuple))

            if current_ref_padded < last_ref_padded:
                last_ref_str_orig = '.'.join(map(str, last_ref_tuple))
                error_message = (
                    f"Validation Error in {file_path} ({context}):\n"
                    f"  Ref '{ref_str}' is not greater than or equal to the previous ref '{last_ref_str_orig}'."
                )
                if error_log is not None:
                    error_log.append(error_message)
                else:
                    print(error_message)
                is_valid = False
        
        last_ref_tuple = current_ref_tuple
    return is_valid
