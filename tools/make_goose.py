import os
import struct
import json
import math

class MeshBuilder:
    def __init__(self):
        self.materials = [
            {'name': 'GooseWhite', 'color': [0.96, 0.97, 0.99, 1.0], 'roughness': 0.45, 'metal': 0.0},
            {'name': 'GooseOrange', 'color': [0.98, 0.48, 0.08, 1.0], 'roughness': 0.35, 'metal': 0.0},
            {'name': 'EyeWhite', 'color': [1.0, 1.0, 1.0, 1.0], 'roughness': 0.1, 'metal': 0.0},
            {'name': 'Black', 'color': [0.12, 0.14, 0.18, 1.0], 'roughness': 0.3, 'metal': 0.0},
            {'name': 'HatBrown', 'color': [0.36, 0.20, 0.10, 1.0], 'roughness': 0.75, 'metal': 0.0},
        ]
        self.parts = [{'positions': [], 'normals': [], 'indices': []} for _ in self.materials]

    def add_triangle(self, mat_id, v0, v1, v2, n0=None, n1=None, n2=None):
        part = self.parts[mat_id]
        if n0 is None:
            ax, ay, az = v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]
            bx, by, bz = v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]
            nx = ay * bz - az * by
            ny = az * bx - ax * bz
            nz = ax * by - ay * bx
            l = math.sqrt(nx*nx + ny*ny + nz*nz) or 1.0
            n0 = n1 = n2 = (nx/l, ny/l, nz/l)
        
        idx = len(part['positions'])
        part['positions'].extend([v0, v1, v2])
        part['normals'].extend([n0, n1, n2])
        part['indices'].extend([idx, idx + 1, idx + 2])

    def add_ellipsoid(self, mat_id, center, rx, ry, rz, rings=16, sectors=16, rot=(0,0,0)):
        cx, cy, cz = center
        rx_rot, ry_rot, rz_rot = rot
        
        def transform(x, y, z):
            x, y, z = x * rx, y * ry, z * rz
            if rx_rot != 0:
                c, s = math.cos(rx_rot), math.sin(rx_rot)
                y, z = y * c - z * s, y * s + z * c
            if ry_rot != 0:
                c, s = math.cos(ry_rot), math.sin(ry_rot)
                x, z = x * c + z * s, -x * s + z * c
            if rz_rot != 0:
                c, s = math.cos(rz_rot), math.sin(rz_rot)
                x, y = x * c - y * s, x * s + y * c
            return (x + cx, y + cy, z + cz)

        for i in range(rings):
            lat0 = math.pi * (-0.5 + float(i) / rings)
            z0 = math.sin(lat0)
            zr0 = math.cos(lat0)
            lat1 = math.pi * (-0.5 + float(i + 1) / rings)
            z1 = math.sin(lat1)
            zr1 = math.cos(lat1)

            for j in range(sectors):
                lon0 = 2 * math.pi * float(j) / sectors
                x0 = math.cos(lon0) * zr0
                y0 = math.sin(lon0) * zr0
                lon1 = 2 * math.pi * float(j + 1) / sectors
                x1 = math.cos(lon1) * zr0
                y1 = math.sin(lon1) * zr0

                x2 = math.cos(lon0) * zr1
                y2 = math.sin(lon0) * zr1
                x3 = math.cos(lon1) * zr1
                y3 = math.sin(lon1) * zr1

                p0 = transform(x0, y0, z0)
                p1 = transform(x1, y1, z0)
                p2 = transform(x2, y2, z1)
                p3 = transform(x3, y3, z1)

                self.add_triangle(mat_id, p0, p1, p2)
                self.add_triangle(mat_id, p1, p3, p2)

    def add_cylinder(self, mat_id, p_bottom, p_top, r_bottom, r_top, sectors=16):
        bx, by, bz = p_bottom
        tx, ty, tz = p_top
        dx, dy, dz = tx - bx, ty - by, tz - bz
        h = math.sqrt(dx*dx + dy*dy + dz*dz) or 1.0
        up = (dx/h, dy/h, dz/h)
        vx = (1, 0, 0) if abs(up[0]) < 0.9 else (0, 1, 0)
        c0 = (up[1]*vx[2] - up[2]*vx[1], up[2]*vx[0] - up[0]*vx[2], up[0]*vx[1] - up[1]*vx[0])
        l0 = math.sqrt(c0[0]**2 + c0[1]**2 + c0[2]**2)
        u0 = (c0[0]/l0, c0[1]/l0, c0[2]/l0)
        u1 = (up[1]*u0[2] - up[2]*u0[1], up[2]*u0[0] - up[0]*u0[2], up[0]*u0[1] - up[1]*u0[0])

        for j in range(sectors):
            a0 = 2 * math.pi * float(j) / sectors
            a1 = 2 * math.pi * float(j + 1) / sectors

            cos0, sin0 = math.cos(a0), math.sin(a0)
            cos1, sin1 = math.cos(a1), math.sin(a1)

            b0 = (bx + (u0[0]*cos0 + u1[0]*sin0)*r_bottom, by + (u0[1]*cos0 + u1[1]*sin0)*r_bottom, bz + (u0[2]*cos0 + u1[2]*sin0)*r_bottom)
            b1 = (bx + (u0[0]*cos1 + u1[0]*sin1)*r_bottom, by + (u0[1]*cos1 + u1[1]*sin1)*r_bottom, bz + (u0[2]*cos1 + u1[2]*sin1)*r_bottom)
            t0 = (tx + (u0[0]*cos0 + u1[0]*sin0)*r_top, ty + (u0[1]*cos0 + u1[1]*sin0)*r_top, tz + (u0[2]*cos0 + u1[2]*sin0)*r_top)
            t1 = (tx + (u0[0]*cos1 + u1[0]*sin1)*r_top, ty + (u0[1]*cos1 + u1[1]*sin1)*r_top, tz + (u0[2]*cos1 + u1[2]*sin1)*r_top)

            self.add_triangle(mat_id, b0, b1, t0)
            self.add_triangle(mat_id, b1, t1, t0)
            self.add_triangle(mat_id, p_bottom, b1, b0)
            self.add_triangle(mat_id, p_top, t0, t1)

    def add_box(self, mat_id, center, size, rot=(0,0,0)):
        cx, cy, cz = center
        sx, sy, sz = size[0]/2, size[1]/2, size[2]/2
        rx, ry, rz = rot
        def transform(x, y, z):
            if rx != 0:
                c, s = math.cos(rx), math.sin(rx)
                y, z = y * c - z * s, y * s + z * c
            if ry != 0:
                c, s = math.cos(ry), math.sin(ry)
                x, z = x * c + z * s, -x * s + z * c
            if rz != 0:
                c, s = math.cos(rz), math.sin(rz)
                x, y = x * c - y * s, x * s + y * c
            return (x + cx, y + cy, z + cz)

        corners = [
            (-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
            (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)
        ]
        tc = [transform(*c) for c in corners]
        faces = [
            (0, 1, 2, 3), # front
            (5, 4, 7, 6), # back
            (4, 0, 3, 7), # left
            (1, 5, 6, 2), # right
            (3, 2, 6, 7), # top
            (4, 5, 1, 0)  # bottom
        ]
        for f in faces:
            self.add_triangle(mat_id, tc[f[0]], tc[f[1]], tc[f[2]])
            self.add_triangle(mat_id, tc[f[0]], tc[f[2]], tc[f[3]])

    def export_glb(self, filepath):
        bin_buffer = bytearray()
        buffer_views = []
        accessors = []
        primitives = []

        for mat_id, part in enumerate(self.parts):
            if not part['positions']:
                continue

            # 1. Indices
            idx_list = part['indices']
            idx_bytes = struct.pack(f'<{len(idx_list)}H', *idx_list)
            while len(idx_bytes) % 4 != 0:
                idx_bytes += b'\x00'

            idx_bv = len(buffer_views)
            buffer_views.append({
                'buffer': 0,
                'byteOffset': len(bin_buffer),
                'byteLength': len(idx_bytes),
                'target': 34963 # ELEMENT_ARRAY_BUFFER
            })
            bin_buffer.extend(idx_bytes)

            idx_acc = len(accessors)
            accessors.append({
                'bufferView': idx_bv,
                'byteOffset': 0,
                'componentType': 5123, # UNSIGNED_SHORT
                'count': len(idx_list),
                'type': 'SCALAR',
                'max': [max(idx_list)],
                'min': [min(idx_list)]
            })

            # 2. Positions
            pos_flat = [coord for pos in part['positions'] for coord in pos]
            pos_bytes = struct.pack(f'<{len(pos_flat)}f', *pos_flat)
            while len(pos_bytes) % 4 != 0:
                pos_bytes += b'\x00'

            pos_bv = len(buffer_views)
            buffer_views.append({
                'buffer': 0,
                'byteOffset': len(bin_buffer),
                'byteLength': len(pos_bytes),
                'target': 34962 # ARRAY_BUFFER
            })
            bin_buffer.extend(pos_bytes)

            xs = [p[0] for p in part['positions']]
            ys = [p[1] for p in part['positions']]
            zs = [p[2] for p in part['positions']]
            pos_acc = len(accessors)
            accessors.append({
                'bufferView': pos_bv,
                'byteOffset': 0,
                'componentType': 5126, # FLOAT
                'count': len(part['positions']),
                'type': 'VEC3',
                'max': [round(max(xs), 4), round(max(ys), 4), round(max(zs), 4)],
                'min': [round(min(xs), 4), round(min(ys), 4), round(min(zs), 4)]
            })

            # 3. Normals
            norm_flat = [coord for n in part['normals'] for coord in n]
            norm_bytes = struct.pack(f'<{len(norm_flat)}f', *norm_flat)
            while len(norm_bytes) % 4 != 0:
                norm_bytes += b'\x00'

            norm_bv = len(buffer_views)
            buffer_views.append({
                'buffer': 0,
                'byteOffset': len(bin_buffer),
                'byteLength': len(norm_bytes),
                'target': 34962 # ARRAY_BUFFER
            })
            bin_buffer.extend(norm_bytes)

            n_acc = len(accessors)
            accessors.append({
                'bufferView': norm_bv,
                'byteOffset': 0,
                'componentType': 5126, # FLOAT
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
        for m in self.materials:
            materials_gltf.append({
                'name': m['name'],
                'pbrMetallicRoughness': {
                    'baseColorFactor': m['color'],
                    'metallicFactor': m['metal'],
                    'roughnessFactor': m['roughness']
                }
            })

        gltf = {
            'asset': {'version': '2.0', 'generator': 'GooseGooseDuck_Generator'},
            'scene': 0,
            'scenes': [{'nodes': [0]}],
            'nodes': [{'mesh': 0, 'name': 'GooseGooseDuck'}],
            'meshes': [{'name': 'GooseGooseDuck_Mesh', 'primitives': primitives}],
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

        with open(filepath, 'wb') as f:
            f.write(header)
            f.write(json_chunk_hdr)
            f.write(json_bytes)
            f.write(bin_chunk_hdr)
            f.write(bin_buffer)

        print(f'Exported GLB successfully to {filepath}! File size: {os.path.getsize(filepath)} bytes')

def main():
    builder = MeshBuilder()
    
    # 1. Torso (Plump, cute pear-shaped goose body)
    builder.add_ellipsoid(0, (0, 0.44, -0.02), 0.32, 0.38, 0.28, rings=20, sectors=20, rot=(-0.10, 0, 0))
    # Belly (Rounded protruding front belly)
    builder.add_ellipsoid(0, (0, 0.40, 0.08), 0.26, 0.30, 0.22, rings=16, sectors=16)

    # 2. Neck (Smooth upright connection)
    builder.add_cylinder(0, (0, 0.58, 0.04), (0, 0.78, 0.09), 0.16, 0.13, sectors=18)
    builder.add_cylinder(0, (0, 0.76, 0.09), (0, 0.98, 0.12), 0.13, 0.12, sectors=18)

    # 3. Head (Cute round cartoon head)
    builder.add_ellipsoid(0, (0, 1.10, 0.14), 0.21, 0.22, 0.22, rings=20, sectors=20)

    # 4. Beak (Flat orange duck/goose bill with curved tip)
    builder.add_box(1, (0, 1.05, 0.38), (0.17, 0.065, 0.22), rot=(0.12, 0, 0))
    builder.add_ellipsoid(1, (0, 1.04, 0.48), 0.082, 0.035, 0.04, rings=12, sectors=12)

    # 5. Cartoon Eyes (Classic Goose Goose Duck expressive eyes)
    builder.add_ellipsoid(2, (-0.14, 1.15, 0.26), 0.065, 0.075, 0.045, rings=14, sectors=14, rot=(0, -0.3, 0))
    builder.add_ellipsoid(2, (0.14, 1.15, 0.26), 0.065, 0.075, 0.045, rings=14, sectors=14, rot=(0, 0.3, 0))
    # Pupils
    builder.add_ellipsoid(3, (-0.155, 1.15, 0.29), 0.035, 0.045, 0.025, rings=10, sectors=10)
    builder.add_ellipsoid(3, (0.155, 1.15, 0.29), 0.035, 0.045, 0.025, rings=10, sectors=10)

    # 6. Wings (Cute side flippers)
    builder.add_ellipsoid(0, (-0.31, 0.46, -0.02), 0.05, 0.22, 0.15, rings=16, sectors=16, rot=(0.25, 0, 0.20))
    builder.add_ellipsoid(0, (0.31, 0.46, -0.02), 0.05, 0.22, 0.15, rings=16, sectors=16, rot=(0.25, 0, -0.20))

    # 7. Tail (Perky tail feathers at the rear)
    builder.add_ellipsoid(0, (0, 0.40, -0.30), 0.12, 0.10, 0.18, rings=14, sectors=14, rot=(-0.45, 0, 0))

    # 8. Legs & Webbed Feet
    builder.add_cylinder(1, (-0.12, 0.04, 0.0), (-0.12, 0.18, 0.0), 0.032, 0.032, sectors=12)
    builder.add_cylinder(1, (0.12, 0.04, 0.0), (0.12, 0.18, 0.0), 0.032, 0.032, sectors=12)
    builder.add_box(1, (-0.12, 0.02, 0.08), (0.14, 0.025, 0.16))
    builder.add_box(1, (0.12, 0.02, 0.08), (0.14, 0.025, 0.16))

    # 9. Detective Fedora Hat (The iconic Goose Goose Duck role hat!)
    builder.add_cylinder(4, (0, 1.29, 0.14), (0, 1.31, 0.14), 0.26, 0.26, sectors=22)
    builder.add_cylinder(4, (0, 1.31, 0.14), (0, 1.48, 0.14), 0.17, 0.14, sectors=22)
    # Hat ribbon band
    builder.add_cylinder(3, (0, 1.31, 0.14), (0, 1.35, 0.14), 0.174, 0.168, sectors=22)

    os.makedirs('static/models', exist_ok=True)
    out_path = os.path.join('static', 'models', 'goose.glb')
    builder.export_glb(out_path)

if __name__ == '__main__':
    main()
