const mongoose = require('mongoose')
const Store = mongoose.model('Store')
const multer = require('multer')
const jimp = require('jimp')
const uuid = require('uuid')

const multerOptions = {
  storage: multer.memoryStorage(),
  fileFilter(req, file, next) {
    const isPhoto = file.mimetype.startsWith('image/')
    if (isPhoto) {
      next(null, true)
    } else {
      next({ message: 'That filetype isn\'t allowed!' }, false)
    }
  } 
}

exports.homePage = (req, res) => {
  res.render('index')
}

exports.addStore = (req, res) => {
  res.render('editStore', { title: 'Add Store' })
}

exports.upload = multer(multerOptions).single('photo')

exports.resize = async (req, res, next) => {
  // check if there is no new file to resize
  if (!req.file) {
    next()
    return
  }
  const extension = req.file.mimetype.split('/')[1]
  req.body.photo = `${uuid.v4()}.${extension}`
  // now we resize
  const photo = await jimp.read(req.file.buffer)
  await photo.resize(800, jimp.AUTO)
  await photo.write(`./public/uploads/${req.body.photo}`)
  // once we have written the photo to our filesystem, keep going!
  next()
}

exports.createStore = async (req, res) => {
  req.body.author = req.user._id
  const store = await (new Store(req.body)).save()
  req.flash('success', `Successfully created ${store.name}. Care to leave a review?`)
  res.redirect(`/store/${store.slug}`)
}

exports.getStores = async (req, res) => {
  const stores = await Store.find()
  res.render('stores', { title: 'Stores', stores })
}

const confirmOwner = (store, user) => {
  if (!store.author.equals(user._id)) {
    throw Error('You must own a store in order to edit it!')
  }
}

exports.editStore = async (req, res) => {
  const store = await Store.findOne({ _id: req.params.id })
  confirmOwner(store, req.user)
  res.render('editStore', { title: `Edit ${store.name}`, store })
}

exports.updateStore = async (req, res) => {
  req.body.location.type = 'Point'
  const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
    new: true, //return the new store instead of the old one
    runValidators: true
  }).exec()
  req.flash(
    'success',
    `Sucessfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store</a>`
  )
  res.redirect(`/stores/${store.id}/edit`)
}

exports.getStoreBySlug = async (req, res, next) => {
  const store = await Store.findOne({ slug: req.params.slug }).populate('author')
  if (!store) return next()
  res.render('store', { store, title: store.name })
}

exports.getStoresByTag = async (req, res) => {
  const tag = req.params.tag
  // if there is no tag, just give me any store that has a tag property on it
  const tagQuery = tag || { $exists: true }
  const tagsPromise = Store.getTagsList()
  const storePromise = Store.find({ tags: tagQuery })
  // no need to wait every single promise. need to wait them all together
  const [tags, stores] = await Promise.all([tagsPromise, storePromise])
  res.render('tag', { tags, title: 'Tags', tag, stores })
}


exports.searchStores = async (req, res) => {
  const stores = await Store
  // first find stores that match
  .find({
    $text: {
      $search: req.query.q
    }
  }, {
    score: { $meta: 'textScore' }
  })
  // then sort them  
  .sort({
    score: { $meta: 'textScore' }
  })
  // limit to only 5 sesults
  .limit(5)
  res.json(stores)
}

exports.mapStores = async (req, res) => {
  const coordinates = [req.query.lng, req.query.lat].map(parseFloat)
  const q = {
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates
        },
        $maxDistance: 10000 // 10km
      }
    }
  }

  const stores = await Store.find(q).select('slug name description location photo').limit(10)
  res.json(stores)
}

exports.mapPage = (req, res) => {
  res.render('map', { title: 'Map' })
}
