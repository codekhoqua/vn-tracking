import os
import struct
import json
import math

def convert():
    fbx_path = os.path.join('static', 'models', 'goose.fbx')
    glb_path = os.path.join('static', 'models', 'goose.glb')

    with open(fbx_path, 'rb') as f:
        data = f.read()

    # 1. Parse Vertices
    v_pos = data.find(b'Vertices') + 8
    vertices = []
    while v_pos < len(data) and data[v_pos:v_pos+1] == b'D':
        val = struct.unpack('<d', data[v_pos+1:v_pos+9])[0]
        vertices.append(val)
        v_pos += 9

    pts = [(vertices[i], vertices[i+1], vertices[i+2]) for i in range(0, len(vertices), 3)]
    print(f'Extracted {len(pts)} vertices.')

    # 2. Parse Normals
    norm_pos = data.find(b'LayerElementNormal')
    normals = []
    if norm_pos != -1:
        n_arr_pos = data.find(b'Normals', norm_pos)
        if n_arr_pos != -1:
            n_pos = n_arr_pos + 7
            while n_pos < len(data) and data[n_pos:n_pos+1] == b'D':
                val = struct.unpack('<d', data[n_pos+1:n_pos+9])[0]
                normals.append(val)
                n_pos += 9

    norms = [(normals[i], normals[i+1], normals[i+2]) for i in range(0, len(normals), 3)] if normals else []
    print(f'Extracted {len(norms)} normals.')

    # 3. Parse PolygonVertexIndex
    p_pos = data.find(b'PolygonVertexIndex') + 18
    poly_indices = []
    while p_pos < len(data) and data[p_pos:p_pos+1] == b'I':
        val = struct.unpack('<i', data[p_pos+1:p_pos+5])[0]
        poly_indices.append(val)
        p_pos += 5

    polygons = []
    current_poly = []
    for idx in poly_indices:
        if idx < 0:
            current_poly.append(~idx)
            polygons.append(current_poly)
            current_poly = []
        else:
            current_poly.append(idx)

    print(f'Extracted {len(polygons)} polygons.')

    # 4. Parse Material indices
    m_pos = data.find(b'LayerElementMaterial')
    sub_pos = data.find(b'Materials', m_pos)
    mat_indices = []
    idx_pos = sub_pos + 9
    while idx_pos < len(data) and data[idx_pos:idx_pos+1] == b'I':
        val = struct.unpack('<i', data[idx_pos+1:idx_pos+5])[0]
        mat_indices.append(val)
        idx_pos += 5

    # 5. Transform coordinates:
    # In FBX: Z is vertical inverted (ground is ~0, head is ~-50, hat ~-65).
    # So Y_up = -fbx_Z.
    # Horizontal center of X, Y:
    cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2.0
    cy = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2.0
    min_z = min(-p[2] for p in pts)
    max_z = max(-p[2] for p in pts)
    height = max_z - min_z

    # Beak angle in (X, Y):
    # Beak center is ~ (9.3, 9.6)
    beak_dx = 9.30 - cx
    beak_dy = 9.58 - cy
    beak_angle = math.atan2(beak_dy, beak_dx)
    # We want beak to point towards +Z (forward in Three.js):
    # Target angle is 0 (or +Z)
    rot = -beak_angle + (math.pi / 2.0)

    # Scale model to 1.3 units height
    scale = 1.30 / height if height > 0 else 1.0

    transformed_pts = []
    for (x, y, z) in pts:
        # 1. Center in X, Y
        tx = x - cx
        ty = y - cy
        # 2. Rotate so forward is +Z
        cos_r = math.cos(rot)
        sin_r = math.sin(rot)
        rx = tx * cos_r - ty * sin_r
        rz = tx * sin_r + ty * cos_r
        # 3. Upright vertical is -z (ground at 0)
        ry = (-z - min_z)
        transformed_pts.append((rx * scale, ry * scale, rz * scale))

    transformed_norms = []
    if len(norms) == len(pts):
        for (nx, ny, nz) in norms:
            cos_r = math.cos(rot)
            sin_r = math.sin(rot)
            rnx = nx * cos_r - ny * sin_r
            rnz = nx * sin_r + ny * cos_r
            rny = -nz
            transformed_norms.append((rnx, rny, rnz))
    else:
        transformed_norms = None

    # Materials definition:
    # Mat 0: Beak & Feet (Leg) -> Vibrant orange
    # Mat 1: White goose feathers (Body)
    # Mat 2: Head feathers (White)
    # Mat 3: Eye / Pupil Sclera (White)
    # Mat 4: Black pupils
    materials_def = [
        {'name': 'BeakAndFeet', 'color': [0.98, 0.45, 0.05, 1.0], 'roughness': 0.35, 'metal': 0.0},
        {'name': 'BodyFeathers', 'color': [0.96, 0.97, 0.99, 1.0], 'roughness': 0.50, 'metal': 0.0},
        {'name': 'HeadFeathers', 'color': [0.98, 0.98, 0.99, 1.0], 'roughness': 0.50, 'metal': 0.0},
        {'name': 'EyeSclera',    'color': [1.0, 1.0, 1.0, 1.0],     'roughness': 0.15, 'metal': 0.0},
        {'name': 'EyePupil',     'color': [0.10, 0.12, 0.15, 1.0], 'roughness': 0.20, 'metal': 0.0},
    ]

    # Group triangles by material
    mat_parts = [{'positions': [], 'normals': [], 'indices': []} for _ in materials_def]

    for face_idx, poly in enumerate(polygons):
        mat_id = mat_indices[face_idx] if face_idx < len(mat_indices) else 0
        if mat_id >= len(mat_parts):
            mat_id = 0

        part = mat_parts[mat_id]

        # Triangulate polygon:
        tris = []
        if len(poly) == 3:
            tris.append((poly[0], poly[1], poly[2]))
        elif len(poly) == 4:
            tris.append((poly[0], poly[1], poly[2]))
            tris.append((poly[0], poly[2], poly[3]))
        else:
            for k in range(1, len(poly) - 1):
                tris.append((poly[0], poly[k], poly[k+1]))

        for (v0, v1, v2) in tris:
            p0 = transformed_pts[v0]
            p1 = transformed_pts[v1]
            p2 = transformed_pts[v2]

            if transformed_norms:
                n0 = transformed_norms[v0]
                n1 = transformed_norms[v1]
                n2 = transformed_norms[v2]
            else:
                # Calculate face normal
                ax, ay, az = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
                bx, by, bz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
                nx = ay * bz - az * by
                ny = az * bx - ax * bz
                nz = ax * by - ay * bx
                l = math.sqrt(nx*nx + ny*ny + nz*nz) or 1.0
                n0 = n1 = n2 = (nx/l, ny/l, nz/l)

            base_idx = len(part['positions'])
            part['positions'].extend([p0, p1, p2])
            part['normals'].extend([n0, n1, n2])
            part['indices'].extend([base_idx, base_idx + 1, base_idx + 2])

    # Build GLB
    bin_buffer = bytearray()
    buffer_views = []
    accessors = []
    primitives = []

    for mat_id, part in enumerate(mat_parts):
        if not part['positions']:
            continue

        idx_list = part['indices']
        # If index count > 65535, use UNSIGNED_INT
        use_uint32 = max(idx_list) >= 65535

        if use_uint32:
            idx_bytes = struct.pack(f'<{len(idx_list)}I', *idx_list)
            comp_type = 5125 # UNSIGNED_INT
        else:
            idx_bytes = struct.pack(f'<{len(idx_list)}H', *idx_list)
            comp_type = 5123 # UNSIGNED_SHORT

        while len(idx_bytes) % 4 != 0:
            idx_bytes += b'\x00'

        idx_bv = len(buffer_views)
        buffer_views.append({
            'buffer': 0,
            'byteOffset': len(bin_buffer),
            'byteLength': len(idx_bytes),
            'target': 34963
        })
        bin_buffer.extend(idx_bytes)

        idx_acc = len(accessors)
        accessors.append({
            'bufferView': idx_bv,
            'byteOffset': 0,
            'componentType': comp_type,
            'count': len(idx_list),
            'type': 'SCALAR',
            'max': [max(idx_list)],
            'min': [min(idx_list)]
        })

        # Positions
        pos_flat = [coord for pos in part['positions'] for coord in pos]
        pos_bytes = struct.pack(f'<{len(pos_flat)}f', *pos_flat)
        while len(pos_bytes) % 4 != 0:
            pos_bytes += b'\x00'

        pos_bv = len(buffer_views)
        buffer_views.append({
            'buffer': 0,
            'byteOffset': len(bin_buffer),
            'byteLength': len(pos_bytes),
            'target': 34962
        })
        bin_buffer.extend(pos_bytes)

        xs = [p[0] for p in part['positions']]
        ys = [p[1] for p in part['positions']]
        zs = [p[2] for p in part['positions']]
        pos_acc = len(accessors)
        accessors.append({
            'bufferView': pos_bv,
            'byteOffset': 0,
            'componentType': 5126,
            'count': len(part['positions']),
            'type': 'VEC3',
            'max': [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
            'min': [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)]
        })

        # Normals
        norm_flat = [coord for n in part['normals'] for coord in n]
        norm_bytes = struct.pack(f'<{len(norm_flat)}f', *norm_flat)
        while len(norm_bytes) % 4 != 0:
            norm_bytes += b'\x00'

        norm_bv = len(buffer_views)
        buffer_views.append({
            'buffer': 0,
            'byteOffset': len(bin_buffer),
            'byteLength': len(norm_bytes),
            'target': 34962
        })
        bin_buffer.extend(norm_bytes)

        n_acc = len(accessors)
        accessors.append({
            'bufferView': norm_bv,
            'byteOffset': 0,
            'componentType': 5126,
            'count': len(part['normals']),
            'type': 'VEC3'
        })

        primitives.append({
            'attributes': {
                'POSITION': pos_acc,
                'NORMAL': n_acc
            },
            'indices': idx_acc,
            'material': mat_id
        })

    materials_gltf = []
    for m in materials_def:
        materials_gltf.append({
            'name': m['name'],
            'pbrMetallicRoughness': {
                'baseColorFactor': m['color'],
                'metallicFactor': m['metal'],
                'roughnessFactor': m['roughness']
            }
        })

    gltf = {
        'asset': {'version': '2.0', 'generator': 'GooseDuck_FBX_to_GLB'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0, 'name': 'GooseDuck_Model'}],
        'meshes': [{'name': 'GooseDuck_Mesh', 'primitives': primitives}],
        'materials': materials_gltf,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(bin_buffer)}]
    }

    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4 != 0:
        json_bytes += b' '

    while len(bin_buffer) % 4 != 0:
        bin_buffer += b'\x00'

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_buffer)
    header = struct.pack('<4sII', b'glTF', 2, total_len)
    json_chunk_hdr = struct.pack('<II', len(json_bytes), 0x4E4F534A)
    bin_chunk_hdr = struct.pack('<II', len(bin_buffer), 0x004E4942)

    with open(glb_path, 'wb') as f:
        f.write(header)
        f.write(json_chunk_hdr)
        f.write(json_bytes)
        f.write(bin_chunk_hdr)
        f.write(bin_buffer)

    print(f'Successfully generated {glb_path} ({os.path.getsize(glb_path)} bytes)!')

if __name__ == '__main__':
    convert()
