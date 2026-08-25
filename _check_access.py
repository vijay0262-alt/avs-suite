import os
p = r'C:\$Recycle.Bin'
print('Dir W_OK:', os.access(p, os.W_OK))
sids = os.listdir(p)
print(f'SIDs: {sids}')
for sid in sids[:2]:
    sp = os.path.join(p, sid)
    print(f'  SID dir: {sp} W_OK={os.access(sp, os.W_OK)}')
    try:
        files = os.listdir(sp)
        print(f'  Files: {len(files)}')
        if files:
            f = os.path.join(sp, files[0])
            print(f'  First file: {f} W_OK={os.access(f, os.W_OK)}')
    except Exception as e:
        print(f'  Error: {e}')
